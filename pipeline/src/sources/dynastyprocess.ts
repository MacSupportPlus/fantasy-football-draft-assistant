import { parseCsv } from "../util/csv.js";

const CROSSWALK_URL = "https://github.com/dynastyprocess/data/raw/master/files/db_playerids.csv";

// Community-maintained ID crosswalk mapping Sleeper IDs directly to
// FantasyPros/gsis/MFL/etc IDs — no name-matching needed. Covers individual
// players only (no team defenses), so D/ST still needs the name-based
// fallback in build-crosswalk.ts.
export interface IdCrosswalkEntry {
  sleeperId: string;
  fantasyProsId: number | null;
  gsisId: string | null;
}

function cleanId(v: string): string | null {
  return v && v !== "NA" ? v : null;
}

export async function fetchIdCrosswalk(): Promise<IdCrosswalkEntry[]> {
  const res = await fetch(CROSSWALK_URL);
  if (!res.ok) {
    throw new Error(
      `dynastyprocess ID crosswalk request failed: ${res.status} ${res.statusText}`
    );
  }
  const rows = parseCsv(await res.text());

  return rows
    .filter((r) => cleanId(r["sleeper_id"]))
    .map((r) => ({
      sleeperId: r["sleeper_id"],
      fantasyProsId: cleanId(r["fantasypros_id"]) ? Number(r["fantasypros_id"]) : null,
      gsisId: cleanId(r["gsis_id"]),
    }));
}
