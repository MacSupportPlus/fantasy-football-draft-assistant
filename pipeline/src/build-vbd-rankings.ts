import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CrosswalkEntry } from "./types/crosswalk.js";
import type { DefenseSeasonStats } from "./types/defense.js";
import type { KickerSeasonStats } from "./types/kicker.js";
import type { Player } from "./types/player.js";
import type { ConsensusRanking, ScoringFormat } from "./types/ranking.js";
import type { SeasonStats } from "./types/stats.js";
import type { VbdEntry } from "./types/vbd.js";
import {
  projectDefensePlayers,
  projectKickerPlayers,
  projectPlayers,
  type PlayerInfo,
} from "./vbd/project-points.js";
import { computeReplacementValues, DEFAULT_LEAGUE_SETTINGS } from "./vbd/replacement.js";
import { computeStrengthOfScheduleByTeam } from "./vbd/strength-of-schedule.js";
import { normalizeTeam } from "./util/normalize.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROCESSED_DIR = path.resolve(__dirname, "../../data/processed");

async function readJson<T>(filename: string): Promise<T> {
  const raw = await readFile(path.join(PROCESSED_DIR, filename), "utf-8");
  return JSON.parse(raw) as T;
}

const SCORING_FORMATS: ScoringFormat[] = ["STD", "HALF_PPR", "PPR"];
const RANKINGS_FILES: Record<ScoringFormat, string> = {
  STD: "rankings-std.json",
  HALF_PPR: "rankings-half-ppr.json",
  PPR: "rankings-ppr.json",
};
const SOS_ELIGIBLE_POSITIONS = new Set(["QB", "RB", "WR", "TE"]);

async function main() {
  const crosswalk = await readJson<CrosswalkEntry[]>("player-crosswalk.json");
  const seasonStats = await readJson<SeasonStats[]>("stats-by-season.json");
  const sleeperPlayers = await readJson<Player[]>("players.json");

  const playerInfoBySleeperId = new Map<string, PlayerInfo>(
    sleeperPlayers.map((p) => [p.id, { age: p.age, injuryStatus: p.injuryStatus }])
  );

  const seasonsByGsisId = new Map<string, SeasonStats[]>();
  for (const s of seasonStats) {
    const list = seasonsByGsisId.get(s.gsisId) ?? [];
    list.push(s);
    seasonsByGsisId.set(s.gsisId, list);
  }

  const defenseSeasons = await readJson<DefenseSeasonStats[]>(
    "defense-stats-by-season.json"
  );
  const defenseSeasonsByTeam = new Map<string, DefenseSeasonStats[]>();
  for (const d of defenseSeasons) {
    const team = normalizeTeam(d.team)!;
    const list = defenseSeasonsByTeam.get(team) ?? [];
    list.push(d);
    defenseSeasonsByTeam.set(team, list);
  }
  const kickerSeasons = await readJson<KickerSeasonStats[]>(
    "kicker-stats-by-season.json"
  );
  const kickerSeasonsByTeam = new Map<string, KickerSeasonStats[]>();
  for (const k of kickerSeasons) {
    const team = normalizeTeam(k.team)!;
    const list = kickerSeasonsByTeam.get(team) ?? [];
    list.push(k);
    kickerSeasonsByTeam.set(team, list);
  }

  console.log("Computing strength-of-schedule multipliers...");
  const sosByTeam = await computeStrengthOfScheduleByTeam(defenseSeasonsByTeam);

  // D/ST and K scoring don't vary by scoring format, so both are computed
  // once and reused for all three outputs below.
  const defenseProjected = projectDefensePlayers(crosswalk, defenseSeasonsByTeam);
  const kickerProjected = projectKickerPlayers(crosswalk, kickerSeasonsByTeam, playerInfoBySleeperId);

  // sleeperId -> crosswalk entry, used below to attach each player's
  // FantasyPros rank for comparison against our own VBD-based rank.
  const crosswalkBySleeperId = new Map(crosswalk.map((c) => [c.sleeperId, c]));

  for (const scoring of SCORING_FORMATS) {
    const rankings = await readJson<ConsensusRanking[]>(RANKINGS_FILES[scoring]);
    const fpById = new Map(rankings.map((r) => [r.fantasyProsId, r]));

    const offenseProjected = projectPlayers(
      crosswalk,
      seasonsByGsisId,
      fpById,
      scoring,
      playerInfoBySleeperId
    );

    // Strength-of-schedule only applies to offense (QB/RB/WR/TE), using
    // each player's own team.
    for (const p of offenseProjected) {
      if (!SOS_ELIGIBLE_POSITIONS.has(p.position)) continue;
      const team = normalizeTeam(p.team);
      const sosMult = (team && sosByTeam.get(team)) ?? 1;
      p.projectedPoints *= sosMult;
    }

    const projected = [...offenseProjected, ...defenseProjected, ...kickerProjected];

    const byPosition = new Map<string, typeof projected>();
    for (const p of projected) {
      const list = byPosition.get(p.position) ?? [];
      list.push(p);
      byPosition.set(p.position, list);
    }

    const replacementValues = computeReplacementValues(byPosition, DEFAULT_LEAGUE_SETTINGS);

    const entries: VbdEntry[] = [];
    for (const [position, players] of byPosition) {
      const replacementValue = replacementValues.get(position) ?? 0;
      const sorted = [...players].sort(
        (a, b) => b.projectedPoints - a.projectedPoints
      );
      sorted.forEach((p, i) => {
        const cw = crosswalkBySleeperId.get(p.sleeperId);
        const fp = cw?.fantasyProsId ? fpById.get(cw.fantasyProsId) : undefined;

        entries.push({
          sleeperId: p.sleeperId,
          name: p.name,
          position: p.position,
          team: p.team,
          scoring,
          projectedPoints: Math.round(p.projectedPoints * 10) / 10,
          source: p.source,
          replacementValue: Math.round(replacementValue * 10) / 10,
          vbdScore: Math.round((p.projectedPoints - replacementValue) * 10) / 10,
          positionRank: i + 1,
          overallRank: 0, // filled in below
          fpPositionRank: fp?.positionRank ?? null,
          fpOverallRank: fp?.rankEcr ?? null,
          fpRankAve: fp?.rankAve ?? null,
          fpRankStd: fp?.rankStd ?? null,
        });
      });
    }

    entries.sort((a, b) => b.vbdScore - a.vbdScore);
    entries.forEach((e, i) => (e.overallRank = i + 1));

    const historyCount = entries.filter((e) => e.source === "history").length;
    console.log(`[${scoring}] ${entries.length} ranked players (${historyCount} from history, ${entries.length - historyCount} interpolated)`);
    console.log(`  replacement values:`, Object.fromEntries(replacementValues));
    console.log(`  top 5: ${entries.slice(0, 5).map((e) => `${e.name} (${e.position}, vbd=${e.vbdScore})`).join(", ")}`);

    const outPath = path.join(
      PROCESSED_DIR,
      `vbd-rankings-${scoring.toLowerCase().replace("_", "-")}.json`
    );
    await writeFile(outPath, JSON.stringify(entries, null, 2));
    console.log(`  wrote ${outPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
