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
}

// The precomputed entry plus live, draft-state-aware numbers recalculated
// against whoever's still available.
export interface LiveVbdEntry extends VbdEntry {
  drafted: boolean;
  liveReplacementValue: number;
  liveVbdScore: number;
  livePositionRank: number;
  liveOverallRank: number;
}
