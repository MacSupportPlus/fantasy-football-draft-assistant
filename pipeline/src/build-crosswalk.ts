import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeName, normalizePosition, normalizeTeam } from "./util/normalize.js";
import { fetchIdCrosswalk } from "./sources/dynastyprocess.js";
import type { Player } from "./types/player.js";
import type { ConsensusRanking } from "./types/ranking.js";
import type { SeasonStats } from "./types/stats.js";
import type { CrosswalkEntry, UnmatchedEntry } from "./types/crosswalk.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROCESSED_DIR = path.resolve(__dirname, "../../data/processed");

async function readJson<T>(filename: string): Promise<T> {
  const raw = await readFile(path.join(PROCESSED_DIR, filename), "utf-8");
  return JSON.parse(raw) as T;
}

function joinKey(name: string, position: string): string {
  return `${normalizeName(name)}|${normalizePosition(position)}`;
}

interface Candidate {
  sleeperId: string;
  team: string | null;
}

// Look up a name/position/team against an index of Sleeper candidates.
// Exact single match wins outright; multiple name matches fall back to
// team as a tie-breaker; anything left is reported as unmatched/ambiguous
// rather than guessed at.
function matchSleeper(
  index: Map<string, Candidate[]>,
  name: string,
  position: string,
  team: string | null
): { sleeperId: string } | { unmatched: UnmatchedEntry["reason"]; candidates?: Candidate[] } {
  const candidates = index.get(joinKey(name, position)) ?? [];
  if (candidates.length === 0) return { unmatched: "no-name-match" };
  if (candidates.length === 1) return { sleeperId: candidates[0].sleeperId };

  const teamMatches = candidates.filter(
    (c) => normalizeTeam(c.team) === normalizeTeam(team)
  );
  if (teamMatches.length === 1) return { sleeperId: teamMatches[0].sleeperId };
  return { unmatched: "ambiguous", candidates };
}

async function main() {
  const sleeperPlayers = await readJson<Player[]>("players.json");

  // FantasyPros IDs are stable across scoring formats; take the union of all
  // three files since each happens to cover a slightly different player pool.
  const fpFiles = ["rankings-std.json", "rankings-ppr.json", "rankings-half-ppr.json"];
  const fpById = new Map<number, ConsensusRanking>();
  for (const file of fpFiles) {
    const rankings = await readJson<ConsensusRanking[]>(file);
    for (const r of rankings) {
      if (!fpById.has(r.fantasyProsId)) fpById.set(r.fantasyProsId, r);
    }
  }

  const seasonStats = await readJson<SeasonStats[]>("stats-by-season.json");
  // Collapse to one row per gsisId, anchored on the most recent season
  // (team/position can drift year to year; latest is the best proxy for
  // "who this player is right now").
  const nflverseByGsisId = new Map<string, SeasonStats>();
  for (const s of seasonStats) {
    const existing = nflverseByGsisId.get(s.gsisId);
    if (!existing || s.season > existing.season) {
      nflverseByGsisId.set(s.gsisId, s);
    }
  }

  // Primary path: dynastyprocess's community-maintained ID crosswalk maps
  // Sleeper IDs directly to FantasyPros/gsis IDs — no name-matching, no
  // nickname problem. It only covers individual players though (no team
  // defenses), so D/ST — and anyone this file hasn't indexed yet, like
  // brand-new rookies — still needs the name-based fallback below.
  console.log("Fetching dynastyprocess ID crosswalk...");
  const idCrosswalk = await fetchIdCrosswalk();
  const directBySleeperId = new Map(idCrosswalk.map((r) => [r.sleeperId, r]));

  const sleeperIndex = new Map<string, Candidate[]>();
  const crosswalk = new Map<string, CrosswalkEntry>();
  const directMatchedFpIds = new Set<number>();
  const directMatchedGsisIds = new Set<string>();

  for (const p of sleeperPlayers) {
    const key = joinKey(p.name, p.position);
    const list = sleeperIndex.get(key) ?? [];
    list.push({ sleeperId: p.id, team: p.team });
    sleeperIndex.set(key, list);

    const direct = directBySleeperId.get(p.id);
    const fantasyProsId = direct?.fantasyProsId ?? null;
    const gsisId = direct?.gsisId ?? null;
    if (fantasyProsId !== null) directMatchedFpIds.add(fantasyProsId);
    if (gsisId !== null) directMatchedGsisIds.add(gsisId);

    crosswalk.set(p.id, {
      sleeperId: p.id,
      name: p.name,
      position: p.position,
      team: p.team,
      fantasyProsId,
      gsisId,
    });
  }

  const unmatched: UnmatchedEntry[] = [];

  for (const fp of fpById.values()) {
    if (directMatchedFpIds.has(fp.fantasyProsId)) continue; // already resolved directly
    const result = matchSleeper(sleeperIndex, fp.name, fp.position, fp.team);
    if ("sleeperId" in result) {
      const entry = crosswalk.get(result.sleeperId)!;
      if (entry.fantasyProsId === null) entry.fantasyProsId = fp.fantasyProsId;
    } else {
      unmatched.push({
        source: "fantasypros",
        name: fp.name,
        position: fp.position,
        team: fp.team,
        reason: result.unmatched,
        candidateSleeperIds: result.candidates?.map((c) => c.sleeperId),
      });
    }
  }

  for (const nf of nflverseByGsisId.values()) {
    if (directMatchedGsisIds.has(nf.gsisId)) continue;
    const result = matchSleeper(sleeperIndex, nf.name, nf.position, nf.team);
    if ("sleeperId" in result) {
      const entry = crosswalk.get(result.sleeperId)!;
      if (entry.gsisId === null) entry.gsisId = nf.gsisId;
    } else {
      unmatched.push({
        source: "nflverse",
        name: nf.name,
        position: nf.position,
        team: nf.team,
        reason: result.unmatched,
        candidateSleeperIds: result.candidates?.map((c) => c.sleeperId),
      });
    }
  }

  const entries = [...crosswalk.values()];
  const withFp = entries.filter((e) => e.fantasyProsId !== null).length;
  const withGsis = entries.filter((e) => e.gsisId !== null).length;

  console.log(`Sleeper players: ${entries.length}`);
  console.log(
    `  matched to FantasyPros: ${withFp} (of ${fpById.size} FP entries; ${directMatchedFpIds.size} via direct ID crosswalk)`
  );
  console.log(
    `  matched to nflverse:    ${withGsis} (of ${nflverseByGsisId.size} nflverse players; ${directMatchedGsisIds.size} via direct ID crosswalk)`
  );
  console.log(`Unmatched/ambiguous entries: ${unmatched.length}`);

  await writeFile(
    path.join(PROCESSED_DIR, "player-crosswalk.json"),
    JSON.stringify(entries, null, 2)
  );
  await writeFile(
    path.join(PROCESSED_DIR, "crosswalk-unmatched.json"),
    JSON.stringify(unmatched, null, 2)
  );
  console.log("Wrote player-crosswalk.json and crosswalk-unmatched.json");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
