import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchGamesCsv, fetchTeamStatsCsv, fetchTeamStatsWeekCsv } from "./sources/nflverse.js";
import { parseCsv } from "./util/csv.js";
import type { SeasonStats } from "./types/stats.js";
import type { DefenseSeasonStats } from "./types/defense.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROCESSED_DIR = path.resolve(__dirname, "../../data/processed");

function num(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// This league's exact D/ST scoring (not a generic default):
// 0 pts allowed=5, 1-6=4, 7-13=3, 14-17=1, 18-27=0, 28-34=-1, 35-45=-3, 46+=-5
function pointsAllowedTier(pointsAllowed: number): number {
  if (pointsAllowed === 0) return 5;
  if (pointsAllowed <= 6) return 4;
  if (pointsAllowed <= 13) return 3;
  if (pointsAllowed <= 17) return 1;
  if (pointsAllowed <= 27) return 0;
  if (pointsAllowed <= 34) return -1;
  if (pointsAllowed <= 45) return -3;
  return -5;
}

// <100=5, 100-199=3, 200-299=2, 300-349=0, 350-399=-1, 400-449=-3,
// 450-499=-5, 500-549=-6, 550+=-7
function yardsAllowedTier(yardsAllowed: number): number {
  if (yardsAllowed < 100) return 5;
  if (yardsAllowed <= 199) return 3;
  if (yardsAllowed <= 299) return 2;
  if (yardsAllowed <= 349) return 0;
  if (yardsAllowed <= 399) return -1;
  if (yardsAllowed <= 449) return -3;
  if (yardsAllowed <= 499) return -5;
  if (yardsAllowed <= 549) return -6;
  return -7;
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

// Weekly team stats include an opponent_team column — a team's yards
// allowed that week is simply its opponent's own total offensive yards
// that week, so this needs no join against schedules.
async function computeYardsAllowedByTeamSeason(
  seasons: number[]
): Promise<Map<string, number>> {
  const byTeamSeason = new Map<string, number>();

  for (const season of seasons) {
    const rows = parseCsv(await fetchTeamStatsWeekCsv(season)).filter(
      (r) => r.season_type === "REG"
    );

    const ownYardsByTeamWeek = new Map<string, number>();
    for (const r of rows) {
      ownYardsByTeamWeek.set(
        `${r.team}|${r.week}`,
        num(r.passing_yards) + num(r.rushing_yards)
      );
    }

    for (const r of rows) {
      const yardsAllowed = ownYardsByTeamWeek.get(`${r.opponent_team}|${r.week}`) ?? 0;
      const key = `${r.team}|${season}`;
      byTeamSeason.set(key, (byTeamSeason.get(key) ?? 0) + yardsAllowedTier(yardsAllowed));
    }
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

  const [pointsAllowedByTeamSeason, yardsAllowedByTeamSeason] = await Promise.all([
    computePointsAllowedByTeamSeason(seasons),
    computeYardsAllowedByTeamSeason(seasons),
  ]);

  const results: DefenseSeasonStats[] = [];
  for (const season of seasons) {
    const rows = parseCsv(await fetchTeamStatsCsv(season));
    for (const r of rows) {
      if (r.season_type !== "REG") continue;

      const sacks = num(r.def_sacks);
      const interceptions = num(r.def_interceptions);
      const fumbleRecoveries = num(r.fumble_recovery_opp);
      const safeties = num(r.def_safeties);
      const defensiveTds =
        num(r.def_tds) + num(r.fumble_recovery_tds) + num(r.special_teams_tds);
      const blockedKicks =
        num(r.def_punt_blocks) + num(r.def_pat_blocks) + num(r.def_fg_blocks);
      const gamesPlayed = num(r.games);
      const pointsAllowedScore = pointsAllowedByTeamSeason.get(`${r.team}|${season}`) ?? 0;
      const yardsAllowedScore = yardsAllowedByTeamSeason.get(`${r.team}|${season}`) ?? 0;

      const fantasyPoints =
        sacks * 1 +
        interceptions * 2 +
        fumbleRecoveries * 2 +
        safeties * 2 +
        defensiveTds * 6 +
        blockedKicks * 2 +
        pointsAllowedScore +
        yardsAllowedScore;

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
        yardsAllowedScore,
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
