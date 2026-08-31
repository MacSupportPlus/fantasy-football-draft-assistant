// Sleeper IDs are the anchor: they're what the live draft board and
// add/drop state will be keyed on. FantasyPros/nflverse IDs get attached
// where a confident match is found; both are nullable since FantasyPros
// only ranks a few hundred players and nflverse only covers skill
// positions with recent play (no long-shot rookies, no defenses).
export interface CrosswalkEntry {
  sleeperId: string;
  name: string;
  position: string;
  team: string | null;
  fantasyProsId: number | null;
  gsisId: string | null;
}

export type UnmatchedReason = "no-name-match" | "ambiguous";

export interface UnmatchedEntry {
  source: "fantasypros" | "nflverse";
  name: string;
  position: string;
  team: string | null;
  reason: UnmatchedReason;
  candidateSleeperIds?: string[];
}
