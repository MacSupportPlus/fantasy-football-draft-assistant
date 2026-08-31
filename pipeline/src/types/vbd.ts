import type { ScoringFormat } from "./ranking.js";

// League settings determine where the "replacement level" line falls at
// each position — this is the single biggest lever in VBD and is meant to
// be edited to match your actual league, not treated as gospel.
export interface LeagueSettings {
  teams: number;
  starters: {
    QB: number;
    RB: number;
    WR: number;
    TE: number;
    FLEX: number; // RB/WR/TE eligible
    K: number;
    DST: number;
  };
  // How FLEX starts get attributed back to RB/WR/TE when computing each
  // position's replacement rank. Should sum to 1.
  flexShare: {
    RB: number;
    WR: number;
    TE: number;
  };
}

export type ProjectionSource = "history" | "interpolated";

export interface ProjectedPlayer {
  sleeperId: string;
  name: string;
  position: string;
  team: string | null;
  projectedPoints: number;
  source: ProjectionSource;
}

export interface VbdEntry {
  sleeperId: string;
  name: string;
  position: string;
  team: string | null;
  scoring: ScoringFormat;
  projectedPoints: number;
  source: ProjectionSource;
  replacementValue: number;
  vbdScore: number;
  positionRank: number;
  overallRank: number;
}
