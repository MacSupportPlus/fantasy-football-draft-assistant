import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchTeamStatsCsv } from "./sources/nflverse.js";
import { parseCsv } from "./util/csv.js";
import type { SeasonStats } from "./types/stats.js";
import type { KickerSeasonStats } from "./types/kicker.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROCESSED_DIR = path.resolve(__dirname, "../../data/processed");

function num(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// This league's exact kicker scoring: FG 0-39=3, 40-49=4, 50-59=5, 60+=6,
// PAT made=1, each missed FG=-1.
async function main() {
  const offenseSeasons = JSON.parse(
    await readFile(path.join(PROCESSED_DIR, "stats-by-season.json"), "utf-8")
  ) as SeasonStats[];
  const seasons = [...new Set(offenseSeasons.map((s) => s.season))]
    .sort((a, b) => b - a)
    .slice(0, 3);
  console.log(`Using seasons: ${seasons.join(", ")}`);

  const results: KickerSeasonStats[] = [];
  for (const season of seasons) {
    const rows = parseCsv(await fetchTeamStatsCsv(season));
    for (const r of rows) {
      if (r.season_type !== "REG") continue;

      const fgMade0to39 =
        num(r.fg_made_0_19) + num(r.fg_made_20_29) + num(r.fg_made_30_39);
      const fgMade40to49 = num(r.fg_made_40_49);
      const fgMade50to59 = num(r.fg_made_50_59);
      const fgMade60Plus = num(r.fg_made_60_);
      const fgMissed = num(r.fg_missed);
      const patMade = num(r.pat_made);
      const gamesPlayed = num(r.games);

      const fantasyPoints =
        fgMade0to39 * 3 +
        fgMade40to49 * 4 +
        fgMade50to59 * 5 +
        fgMade60Plus * 6 +
        patMade * 1 -
        fgMissed * 1;

      results.push({
        team: r.team,
        season,
        gamesPlayed,
        fgMade: fgMade0to39 + fgMade40to49 + fgMade50to59 + fgMade60Plus,
        fgMissed,
        fgMade0to39,
        fgMade40to49,
        fgMade50to59,
        fgMade60Plus,
        patMade,
        fantasyPoints,
        fantasyPointsPerGame: gamesPlayed > 0 ? fantasyPoints / gamesPlayed : 0,
      });
    }
  }

  console.log(`Computed ${results.length} team-kicker-seasons.`);
  const outPath = path.join(PROCESSED_DIR, "kicker-stats-by-season.json");
  await mkdir(PROCESSED_DIR, { recursive: true });
  await writeFile(outPath, JSON.stringify(results, null, 2));
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
