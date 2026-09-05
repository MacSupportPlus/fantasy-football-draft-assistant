export type ScoringFormat = 'STD' | 'HALF_PPR' | 'PPR';
export type ProjectionSource = 'history' | 'interpolated';

// Matches pipeline/src/types/vbd.ts VbdEntry exactly — this is what
// data/processed/vbd-rankings-*.json actually contains.
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
  fpPositionRank: string | null;
  fpOverallRank: number | null;
  fpRankAve: number | null;
  fpRankStd: number | null;
}

// The precomputed entry plus live, draft-state-aware numbers recalculated
// against whoever's still available.
export interface LiveVbdEntry extends VbdEntry {
  drafted: boolean;
  liveReplacementValue: number;
  liveVbdScore: number;
  livePositionRank: number;
  liveOverallRank: number;
  // Odds (0-1) this player is still on the board next time it's your turn,
  // given your draft slot — null if no draft slot is set or no FP rank data.
  survivalPct: number | null;
}
