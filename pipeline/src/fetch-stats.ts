import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchPlayerStatsCsv } from "./sources/nflverse.js";
import { parseCsv } from "./util/csv.js";
import type { SeasonStats } from "./types/stats.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROCESSED_PATH = path.resolve(
  __dirname,
  "../../data/processed/stats-by-season.json"
);

const SEASONS_OF_HISTORY = 3;

function num(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function aggregateSeasons(rows: Record<string, string>[]): SeasonStats[] {
  const regularSeason = rows.filter((r) => r.season_type === "REG");

  const latestSeason = regularSeason.reduce(
    (max, r) => Math.max(max, num(r.season)),
    0
  );
  const cutoff = latestSeason - (SEASONS_OF_HISTORY - 1);
  const inWindow = regularSeason.filter((r) => num(r.season) >= cutoff);

  const bySeasonPlayer = new Map<string, SeasonStats>();

  for (const r of inWindow) {
    const key = `${r.player_id}|${r.season}`;
    let agg = bySeasonPlayer.get(key);
    if (!agg) {
      agg = {
        gsisId: r.player_id,
        name: r.player_display_name || r.player_name,
        position: r.position,
        team: r.recent_team,
        season: num(r.season),
        gamesPlayed: 0,
        passingYards: 0,
        passingTds: 0,
        interceptions: 0,
        carries: 0,
        rushingYards: 0,
        rushingTds: 0,
        targets: 0,
        receptions: 0,
        receivingYards: 0,
        receivingTds: 0,
        fantasyPointsStd: 0,
        fantasyPointsHalfPpr: 0,
        fantasyPointsPpr: 0,
        fantasyPointsStdPerGame: 0,
        fantasyPointsHalfPprPerGame: 0,
        fantasyPointsPprPerGame: 0,
        targetShare: 0,
        airYardsShare: 0,
        wopr: 0,
      };
      bySeasonPlayer.set(key, agg);
    }

    // Most recent row's team/position wins, in case a player was traded mid-season.
    agg.team = r.recent_team || agg.team;
    agg.position = r.position || agg.position;

    agg.gamesPlayed += 1;
    agg.passingYards += num(r.passing_yards);
    agg.passingTds += num(r.passing_tds);
    agg.interceptions += num(r.interceptions);
    agg.carries += num(r.carries);
    agg.rushingYards += num(r.rushing_yards);
    agg.rushingTds += num(r.rushing_tds);
    agg.targets += num(r.targets);
    agg.receptions += num(r.receptions);
    agg.receivingYards += num(r.receiving_yards);
    agg.receivingTds += num(r.receiving_tds);
    agg.fantasyPointsStd += num(r.fantasy_points);
    agg.fantasyPointsPpr += num(r.fantasy_points_ppr);
    // Accumulated here as sums, divided into season averages below - these
    // are per-week rate stats (e.g. 0.25 = 25% of team targets that week),
    // not counting stats, so they don't mean anything summed raw.
    agg.targetShare += num(r.target_share);
    agg.airYardsShare += num(r.air_yards_share);
    agg.wopr += num(r.wopr);
  }

  const seasons = [...bySeasonPlayer.values()];
  for (const s of seasons) {
    s.fantasyPointsHalfPpr = (s.fantasyPointsStd + s.fantasyPointsPpr) / 2;
    s.fantasyPointsStdPerGame = s.fantasyPointsStd / s.gamesPlayed;
    s.fantasyPointsHalfPprPerGame = s.fantasyPointsHalfPpr / s.gamesPlayed;
    s.fantasyPointsPprPerGame = s.fantasyPointsPpr / s.gamesPlayed;
    s.targetShare = s.targetShare / s.gamesPlayed;
    s.airYardsShare = s.airYardsShare / s.gamesPlayed;
    s.wopr = s.wopr / s.gamesPlayed;
  }

  return seasons;
}

async function main() {
  console.log("Fetching nflverse weekly player stats (this file is ~30MB)...");
  const csv = await fetchPlayerStatsCsv();
  const rows = parseCsv(csv);
  console.log(`Parsed ${rows.length} weekly rows.`);

  const seasons = aggregateSeasons(rows);
  console.log(
    `Aggregated to ${seasons.length} player-seasons (last ${SEASONS_OF_HISTORY} regular seasons).`
  );

  await mkdir(path.dirname(PROCESSED_PATH), { recursive: true });
  await writeFile(PROCESSED_PATH, JSON.stringify(seasons, null, 2));
  console.log(`Wrote ${PROCESSED_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
