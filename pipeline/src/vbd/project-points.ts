import type { CrosswalkEntry } from "../types/crosswalk.js";
import type { DefenseSeasonStats } from "../types/defense.js";
import type { KickerSeasonStats } from "../types/kicker.js";
import type { ConsensusRanking, ScoringFormat } from "../types/ranking.js";
import type { SeasonStats } from "../types/stats.js";
import type { ProjectedPlayer } from "../types/vbd.js";
import { normalizeTeam } from "../util/normalize.js";
import { ageMultiplier, injuryMultiplier, opportunityTrendMultiplier } from "./adjustments.js";

const MAX_GAMES = 17;

// Most-recent-season-first weights. Fewer seasons of history just means
// fewer weights used (they're not renormalized further since they already
// sum to 1 for every count from 1-3).
const RECENCY_WEIGHTS: Record<number, number[]> = {
  1: [1],
  2: [0.6, 0.4],
  3: [0.5, 0.3, 0.2],
};

// How far a player's own weighted rate gets pulled toward its position's
// average when blending in FantasyPros' expert view (see BLEND_WEIGHT
// below) - experts price in context (trades, scheme changes, injury
// outlook) that trailing stats alone can't see.
const BLEND_WEIGHT = 0.2;

// Regression-to-the-mean strength: how many "average games" of prior belief
// get blended into a player's own rate. Higher = more shrinkage for players
// with a thin sample (fewer weighted games of history).
const SHRINKAGE_GAMES = 6;

export interface PlayerInfo {
  age: number | null;
  injuryStatus: string | null;
}

function perGameField(scoring: ScoringFormat): keyof SeasonStats {
  switch (scoring) {
    case "STD":
      return "fantasyPointsStdPerGame";
    case "HALF_PPR":
      return "fantasyPointsHalfPprPerGame";
    case "PPR":
      return "fantasyPointsPprPerGame";
  }
}

function parsePositionRank(posRank: string): number | null {
  const match = posRank.match(/(\d+)$/);
  return match ? Number(match[1]) : null;
}

// For players with no usable history (rookies, practice-squad call-ups),
// interpolate a projection from where they rank among historically-anchored
// players at the same position, using FantasyPros' position rank as the x-axis.
// Also used to derive a "what do experts' rank imply this player is worth"
// value to blend into every history-based player's own projection.
function buildInterpolationCurve(
  anchors: { posRankNum: number; points: number }[]
): (posRankNum: number) => number | null {
  const sorted = [...anchors].sort((a, b) => a.posRankNum - b.posRankNum);
  if (sorted.length === 0) return () => null;

  return (posRankNum: number) => {
    if (posRankNum <= sorted[0].posRankNum) return sorted[0].points;
    if (posRankNum >= sorted[sorted.length - 1].posRankNum) {
      return sorted[sorted.length - 1].points;
    }
    for (let i = 0; i < sorted.length - 1; i++) {
      const lo = sorted[i];
      const hi = sorted[i + 1];
      if (posRankNum >= lo.posRankNum && posRankNum <= hi.posRankNum) {
        if (hi.posRankNum === lo.posRankNum) return lo.points;
        const t = (posRankNum - lo.posRankNum) / (hi.posRankNum - lo.posRankNum);
        return lo.points + t * (hi.points - lo.points);
      }
    }
    return null;
  };
}

interface RawHistory {
  position: string;
  rate: number; // recency-weighted points-per-game, pre-regression
  games: number; // recency-weighted games estimate, pre-cap
  recentWopr: number | null;
  priorWopr: number | null;
}

export function projectPlayers(
  crosswalk: CrosswalkEntry[],
  seasonsByGsisId: Map<string, SeasonStats[]>,
  fpById: Map<number, ConsensusRanking>,
  scoring: ScoringFormat,
  playerInfoBySleeperId: Map<string, PlayerInfo>
): ProjectedPlayer[] {
  const field = perGameField(scoring);

  // Pass 1: raw recency-weighted rate/games per player with usable history.
  const rawBySleeperId = new Map<string, RawHistory>();
  for (const p of crosswalk) {
    if (!p.gsisId) continue;
    const seasons = seasonsByGsisId.get(p.gsisId);
    if (!seasons || seasons.length === 0) continue;

    const recent = [...seasons].sort((a, b) => b.season - a.season).slice(0, 3);
    const weights = RECENCY_WEIGHTS[recent.length];

    let rate = 0;
    let games = 0;
    recent.forEach((s, i) => {
      rate += weights[i] * (s[field] as number);
      games += weights[i] * s.gamesPlayed;
    });

    rawBySleeperId.set(p.sleeperId, {
      position: p.position,
      rate,
      games,
      recentWopr: recent[0]?.wopr ?? null,
      priorWopr: recent[1]?.wopr ?? null,
    });
  }

  // Pass 2: regress each player's rate toward their position's average rate,
  // weighted by how thin their own sample is (fewer weighted games ->
  // pulled harder toward the mean). A fluky small-sample season shouldn't
  // get projected forward at face value.
  //
  // The reference mean is computed only from players with a real starter-
  // level sample (>= STARTER_GAMES weighted games) — every position's
  // crosswalk includes a long tail of backups with a handful of snaps
  // (there are 117 QBs in this dataset; most never start), and including
  // them would drag the "average" QB rate down to something no starter
  // actually resembles, over-shrinking every legitimate starter toward a
  // backup-level baseline. Regressing toward a sensible reference class,
  // not the full heterogeneous population, is the point of this technique.
  const STARTER_GAMES = 12;
  const rateTotalsByPosition = new Map<string, { sum: number; count: number }>();
  for (const raw of rawBySleeperId.values()) {
    if (raw.games < STARTER_GAMES) continue;
    const acc = rateTotalsByPosition.get(raw.position) ?? { sum: 0, count: 0 };
    acc.sum += raw.rate;
    acc.count += 1;
    rateTotalsByPosition.set(raw.position, acc);
  }
  const meanRateByPosition = new Map(
    [...rateTotalsByPosition.entries()].map(([pos, { sum, count }]) => [pos, sum / count])
  );

  const baseProjectionBySleeperId = new Map<string, number>();
  for (const [sleeperId, raw] of rawBySleeperId) {
    const meanRate = meanRateByPosition.get(raw.position) ?? raw.rate;
    const shrunkRate =
      (raw.games * raw.rate + SHRINKAGE_GAMES * meanRate) / (raw.games + SHRINKAGE_GAMES);
    baseProjectionBySleeperId.set(sleeperId, shrunkRate * Math.min(raw.games, MAX_GAMES));
  }

  // Build one "FantasyPros position rank -> points" curve per position from
  // players who have both a (shrunk) history-based projection and a rank.
  const anchorsByPosition = new Map<string, { posRankNum: number; points: number }[]>();
  for (const p of crosswalk) {
    const points = baseProjectionBySleeperId.get(p.sleeperId);
    if (points === undefined || !p.fantasyProsId) continue;
    const fp = fpById.get(p.fantasyProsId);
    if (!fp) continue;
    const posRankNum = parsePositionRank(fp.positionRank);
    if (posRankNum === null) continue;

    const list = anchorsByPosition.get(p.position) ?? [];
    list.push({ posRankNum, points });
    anchorsByPosition.set(p.position, list);
  }
  const curvesByPosition = new Map(
    [...anchorsByPosition.entries()].map(([pos, anchors]) => [
      pos,
      buildInterpolationCurve(anchors),
    ])
  );

  const projected: ProjectedPlayer[] = [];

  for (const p of crosswalk) {
    const info = playerInfoBySleeperId.get(p.sleeperId);
    const injuryMult = injuryMultiplier(info?.injuryStatus ?? null);

    const basePoints = baseProjectionBySleeperId.get(p.sleeperId);
    if (basePoints !== undefined) {
      const raw = rawBySleeperId.get(p.sleeperId)!;

      // Blend in what FantasyPros' consensus rank implies this player is
      // worth - experts see context (trades, scheme, injury recovery
      // outlook) trailing stats alone can't. Rank-only players (no history)
      // are handled entirely separately below.
      let blended = basePoints;
      if (p.fantasyProsId) {
        const fp = fpById.get(p.fantasyProsId);
        const posRankNum = fp ? parsePositionRank(fp.positionRank) : null;
        const rankImplied =
          posRankNum !== null ? curvesByPosition.get(p.position)?.(posRankNum) ?? null : null;
        if (rankImplied !== null) {
          blended = basePoints * (1 - BLEND_WEIGHT) + rankImplied * BLEND_WEIGHT;
        }
      }

      const ageMult = ageMultiplier(p.position, info?.age ?? null);
      const trendMult = opportunityTrendMultiplier(raw.recentWopr, raw.priorWopr);

      projected.push({
        sleeperId: p.sleeperId,
        name: p.name,
        position: p.position,
        team: p.team,
        projectedPoints: blended * ageMult * injuryMult * trendMult,
        source: "history",
      });
      continue;
    }

    if (!p.fantasyProsId) continue; // no history, no FP rank -> unrankable
    const fp = fpById.get(p.fantasyProsId);
    if (!fp) continue;
    const posRankNum = parsePositionRank(fp.positionRank);
    if (posRankNum === null) continue;

    const curve = curvesByPosition.get(p.position);
    const interpolated = curve?.(posRankNum) ?? null;
    if (interpolated === null) continue;

    projected.push({
      sleeperId: p.sleeperId,
      name: p.name,
      position: p.position,
      team: p.team,
      projectedPoints: interpolated * injuryMult,
      source: "interpolated",
    });
  }

  return projected;
}

// D/ST scoring doesn't vary by PPR/Half-PPR/Standard, so this is run once
// and reused across all three scoring-format outputs. Sleeper's DEF entries
// use the team abbreviation as both the player ID and the position label
// "DEF" — nflverse's team defense stats use "DST"-style team codes with
// their own abbreviation quirks (normalizeTeam reconciles those). Not
// age/injury-adjusted - D/ST is a team unit, not an individual.
export function projectDefensePlayers(
  crosswalk: CrosswalkEntry[],
  seasonsByTeam: Map<string, DefenseSeasonStats[]>
): ProjectedPlayer[] {
  const projected: ProjectedPlayer[] = [];

  for (const p of crosswalk) {
    if (p.position !== "DEF") continue;
    const team = normalizeTeam(p.team);
    const seasons = team ? seasonsByTeam.get(team) : undefined;
    if (!seasons || seasons.length === 0) continue;

    const recent = [...seasons].sort((a, b) => b.season - a.season).slice(0, 3);
    const weights = RECENCY_WEIGHTS[recent.length];

    let perGame = 0;
    let games = 0;
    recent.forEach((s, i) => {
      perGame += weights[i] * s.fantasyPointsPerGame;
      games += weights[i] * s.gamesPlayed;
    });

    projected.push({
      sleeperId: p.sleeperId,
      name: p.name,
      position: "DST",
      team: p.team,
      projectedPoints: perGame * Math.min(games, MAX_GAMES),
      source: "history",
    });
  }

  return projected;
}

// Kickers: nflverse has no per-kicker stats, only team-level FG/PAT data, so
// this proxies "whoever kicks for this team" the same way D/ST does — every
// Sleeper-rostered K at a given team gets that team's historical kicking
// output. If a kicker just changed teams, this reflects his new team's
// recent kicking history, not his own — a real limitation, not a bug. Does
// get an injury-status discount (that part is about the actual rostered
// player), but no age curve — no well-documented kicker aging pattern.
export function projectKickerPlayers(
  crosswalk: CrosswalkEntry[],
  seasonsByTeam: Map<string, KickerSeasonStats[]>,
  playerInfoBySleeperId: Map<string, PlayerInfo>
): ProjectedPlayer[] {
  const projected: ProjectedPlayer[] = [];

  for (const p of crosswalk) {
    if (p.position !== "K") continue;
    const team = normalizeTeam(p.team);
    const seasons = team ? seasonsByTeam.get(team) : undefined;
    if (!seasons || seasons.length === 0) continue;

    const recent = [...seasons].sort((a, b) => b.season - a.season).slice(0, 3);
    const weights = RECENCY_WEIGHTS[recent.length];

    let perGame = 0;
    let games = 0;
    recent.forEach((s, i) => {
      perGame += weights[i] * s.fantasyPointsPerGame;
      games += weights[i] * s.gamesPlayed;
    });

    const info = playerInfoBySleeperId.get(p.sleeperId);
    const injuryMult = injuryMultiplier(info?.injuryStatus ?? null);

    projected.push({
      sleeperId: p.sleeperId,
      name: p.name,
      position: "K",
      team: p.team,
      projectedPoints: perGame * Math.min(games, MAX_GAMES) * injuryMult,
      source: "history",
    });
  }

  return projected;
}
