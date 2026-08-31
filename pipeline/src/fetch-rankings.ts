import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchConsensusRankings } from "./sources/fantasypros.js";
import type { ScoringFormat } from "./types/ranking.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROCESSED_DIR = path.resolve(__dirname, "../../data/processed");

const SCORING_FORMATS: ScoringFormat[] = ["STD", "HALF_PPR", "PPR"];

async function main() {
  await mkdir(PROCESSED_DIR, { recursive: true });

  for (const scoring of SCORING_FORMATS) {
    console.log(`Fetching FantasyPros consensus rankings (${scoring})...`);
    const rankings = await fetchConsensusRankings(scoring);
    console.log(`  Got ${rankings.length} ranked players.`);

    const outPath = path.join(
      PROCESSED_DIR,
      `rankings-${scoring.toLowerCase().replace("_", "-")}.json`
    );
    await writeFile(outPath, JSON.stringify(rankings, null, 2));
    console.log(`  Wrote ${outPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
