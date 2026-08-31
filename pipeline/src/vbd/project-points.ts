import type { CrosswalkEntry } from "../types/crosswalk.js";
import type { ConsensusRanking, ScoringFormat } from "../types/ranking.js";
import type { SeasonStats } from "../types/stats.js";
import type { ProjectedPlayer } from "../types/vbd.js";

const MAX_GAMES = 17;

// Most-recent-season-first weights. Fewer seasons of history just means
// fewer weights used (they're not renormalized further since they already
// sum to 1 for every count from 1-3).
const RECENCY_WEIGHTS: Record<number, number[]> = {
  1: [1],
  2: [0.6, 0.4],
  3: [0.5, 0.3, 0.2],
};

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

// Recency-weighted per-game rate and games-played, so a player who's missed
// time recently projects fewer games rather than a flat 17 for everyone.
function projectFromHistory(
  seasons: SeasonStats[],
  scoring: ScoringFormat
): number {
  const recent = [...seasons].sort((a, b) => b.season - a.season).slice(0, 3);
  const weights = RECENCY_WEIGHTS[recent.length];
  const field = perGameField(scoring);

  let perGame = 0;
  let games = 0;
  recent.forEach((s, i) => {
    perGame += weights[i] * (s[field] as number);
    games += weights[i] * s.gamesPlayed;
  });

  return perGame * Math.min(games, MAX_GAMES);
}

function parsePositionRank(posRank: string): number | null {
  const match = posRank.match(/(\d+)$/);
  return match ? Number(match[1]) : null;
}

// For players with no usable history (rookies, practice-squad call-ups),
// interpolate a projection from where they rank among historically-anchored
// players at the same position, using FantasyPros' position rank as the x-axis.
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

export function projectPlayers(
  crosswalk: CrosswalkEntry[],
  seasonsByGsisId: Map<string, SeasonStats[]>,
  fpById: Map<number, ConsensusRanking>,
  scoring: ScoringFormat
): ProjectedPlayer[] {
  const historyProjections = new Map<string, number>(); // sleeperId -> points

  for (const p of crosswalk) {
    if (!p.gsisId) continue;
    const seasons = seasonsByGsisId.get(p.gsisId);
    if (!seasons || seasons.length === 0) continue;
    historyProjections.set(p.sleeperId, projectFromHistory(seasons, scoring));
  }

  // Build one interpolation curve per position from players who have both
  // a history-based projection and a FantasyPros position rank.
  const anchorsByPosition = new Map<
    string,
    { posRankNum: number; points: number }[]
  >();
  for (const p of crosswalk) {
    const points = historyProjections.get(p.sleeperId);
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
    const historyPoints = historyProjections.get(p.sleeperId);
    if (historyPoints !== undefined) {
      projected.push({
        sleeperId: p.sleeperId,
        name: p.name,
        position: p.position,
        team: p.team,
        projectedPoints: historyPoints,
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
      projectedPoints: interpolated,
      source: "interpolated",
    });
  }

  return projected;
}
