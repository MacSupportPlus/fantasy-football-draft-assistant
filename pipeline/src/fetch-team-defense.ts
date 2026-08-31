import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchGamesCsv, fetchTeamStatsCsv } from "./sources/nflverse.js";
import { parseCsv } from "./util/csv.js";
import type { SeasonStats } from "./types/stats.js";
import type { DefenseSeasonStats } from "./types/defense.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROCESSED_DIR = path.resolve(__dirname, "../../data/processed");

function num(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Standard D/ST points-allowed tiers, scored per game (not on the season
// total — allowing 35 in one game and 0 in another is very different from
// allowing 17.5 twice).
function pointsAllowedTier(pointsAllowed: number): number {
  if (pointsAllowed === 0) return 10;
  if (pointsAllowed <= 6) return 7;
  if (pointsAllowed <= 13) return 4;
  if (pointsAllowed <= 20) return 1;
  if (pointsAllowed <= 27) return 0;
  if (pointsAllowed <= 34) return -1;
  return -4;
}

async function computePointsAllowedByTeamSeason(
  seasons: number[]
): Promise<Map<string, number>> {
  const games = parseCsv(await fetchGamesCsv());
  const byTeamSeason = new Map<string, number>();

  for (const g of games) {
    if (g.game_type !== "REG") continue;
    const season = num(g.season);
    if (!seasons.includes(season)) continue;
    if (g.home_score === "" || g.away_score === "") continue; // not yet played

    const homeScore = num(g.home_score);
    const awayScore = num(g.away_score);

    const homeKey = `${g.home_team}|${season}`;
    const awayKey = `${g.away_team}|${season}`;
    byTeamSeason.set(homeKey, (byTeamSeason.get(homeKey) ?? 0) + pointsAllowedTier(awayScore));
    byTeamSeason.set(awayKey, (byTeamSeason.get(awayKey) ?? 0) + pointsAllowedTier(homeScore));
  }

  return byTeamSeason;
}

async function main() {
  // Reuse the same season window the offensive stats pipeline already
  // settled on, so the two stay in sync automatically.
  const offenseSeasons = JSON.parse(
    await readFile(path.join(PROCESSED_DIR, "stats-by-season.json"), "utf-8")
  ) as SeasonStats[];
  const seasons = [...new Set(offenseSeasons.map((s) => s.season))]
    .sort((a, b) => b - a)
    .slice(0, 3);
  console.log(`Using seasons: ${seasons.join(", ")}`);

  const pointsAllowedByTeamSeason = await computePointsAllowedByTeamSeason(seasons);

  const results: DefenseSeasonStats[] = [];
  for (const season of seasons) {
    const rows = parseCsv(await fetchTeamStatsCsv(season));
    for (const r of rows) {
      if (r.season_type !== "REG") continue;

      const sacks = num(r.def_sacks);
      const interceptions = num(r.def_interceptions);
      const fumbleRecoveries = num(r.fumble_recovery_opp);
      const safeties = num(r.def_safeties);
      // def_tds: INT-return/blocked-kick-return TDs. fumble_recovery_tds and
      // special_teams_tds are tracked separately by nflverse and don't
      // overlap with def_tds or each other.
      const defensiveTds =
        num(r.def_tds) + num(r.fumble_recovery_tds) + num(r.special_teams_tds);
      const blockedKicks =
        num(r.def_punt_blocks) + num(r.def_pat_blocks) + num(r.def_fg_blocks);
      const gamesPlayed = num(r.games);
      const pointsAllowedScore =
        pointsAllowedByTeamSeason.get(`${r.team}|${season}`) ?? 0;

      const fantasyPoints =
        sacks * 1 +
        interceptions * 2 +
        fumbleRecoveries * 2 +
        safeties * 2 +
        defensiveTds * 6 +
        blockedKicks * 2 +
        pointsAllowedScore;

      results.push({
        team: r.team,
        season,
        gamesPlayed,
        sacks,
        interceptions,
        fumbleRecoveries,
        safeties,
        defensiveTds,
        blockedKicks,
        pointsAllowedScore,
        fantasyPoints,
        fantasyPointsPerGame: gamesPlayed > 0 ? fantasyPoints / gamesPlayed : 0,
      });
    }
  }

  console.log(`Computed ${results.length} team-defense-seasons.`);
  const outPath = path.join(PROCESSED_DIR, "defense-stats-by-season.json");
  await mkdir(PROCESSED_DIR, { recursive: true });
  await writeFile(outPath, JSON.stringify(results, null, 2));
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
