import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchSleeperPlayers } from "./sources/sleeper.js";
import {
  FANTASY_POSITIONS,
  type Player,
  type SleeperPlayerMap,
} from "./types/player.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../data");
const RAW_PATH = path.join(DATA_DIR, "raw", "sleeper-players.json");
const PROCESSED_PATH = path.join(DATA_DIR, "processed", "players.json");

function normalize(raw: SleeperPlayerMap): Player[] {
  const players: Player[] = [];

  for (const sp of Object.values(raw)) {
    // Team defenses and rostered offense/kickers only — drop free agents
    // and anyone not on the fantasy-relevant position list.
    if (!sp.position || !sp.team) continue;
    if (!FANTASY_POSITIONS.includes(sp.position as (typeof FANTASY_POSITIONS)[number])) {
      continue;
    }

    players.push({
      id: sp.player_id,
      name: sp.full_name ?? `${sp.first_name ?? ""} ${sp.last_name ?? ""}`.trim(),
      position: sp.position as Player["position"],
      team: sp.team,
      status: sp.status,
      injuryStatus: sp.injury_status,
      yearsExp: sp.years_exp,
      age: sp.age,
      searchRank: sp.search_rank,
    });
  }

  return players;
}

async function main() {
  console.log("Fetching player data from Sleeper...");
  const raw = await fetchSleeperPlayers();
  const rawCount = Object.keys(raw).length;
  console.log(`Fetched ${rawCount} raw entries.`);

  const players = normalize(raw);
  console.log(`Kept ${players.length} fantasy-relevant, rostered players.`);

  await mkdir(path.dirname(RAW_PATH), { recursive: true });
  await mkdir(path.dirname(PROCESSED_PATH), { recursive: true });

  await writeFile(RAW_PATH, JSON.stringify(raw, null, 2));
  await writeFile(PROCESSED_PATH, JSON.stringify(players, null, 2));

  console.log(`Wrote raw data to ${RAW_PATH}`);
  console.log(`Wrote processed data to ${PROCESSED_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
