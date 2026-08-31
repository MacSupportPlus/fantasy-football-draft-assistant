// Mirrors the relevant fields of pipeline/src/types/*.ts JSON output exactly
// — these are read straight from data/processed/*.json, no transformation.

export interface CrosswalkEntry {
  sleeperId: string;
  name: string;
  position: string;
  team: string | null;
  fantasyProsId: number | null;
  gsisId: string | null;
}

export interface ConsensusRanking {
  fantasyProsId: number;
  name: string;
  team: string | null;
  position: string;
  positionRank: string;
  tier: number;
  rankEcr: number;
  rankAve: number;
  rankMin: number;
  rankMax: number;
  rankStd: number;
  ownedPct: number | null;
  byeWeek: number | null;
}

export interface SeasonStats {
  gsisId: string;
  name: string;
  position: string;
  team: string;
  season: number;
  gamesPlayed: number;
  passingYards: number;
  passingTds: number;
  interceptions: number;
  carries: number;
  rushingYards: number;
  rushingTds: number;
  targets: number;
  receptions: number;
  receivingYards: number;
  receivingTds: number;
  fantasyPointsStd: number;
  fantasyPointsHalfPpr: number;
  fantasyPointsPpr: number;
  fantasyPointsStdPerGame: number;
  fantasyPointsHalfPprPerGame: number;
  fantasyPointsPprPerGame: number;
}

export interface DefenseSeasonStats {
  team: string;
  season: number;
  gamesPlayed: number;
  sacks: number;
  interceptions: number;
  fumbleRecoveries: number;
  safeties: number;
  defensiveTds: number;
  blockedKicks: number;
  pointsAllowedScore: number;
  yardsAllowedScore: number;
  fantasyPoints: number;
  fantasyPointsPerGame: number;
}

export interface KickerSeasonStats {
  team: string;
  season: number;
  gamesPlayed: number;
  fgMade: number;
  fgMissed: number;
  fgMade0to39: number;
  fgMade40to49: number;
  fgMade50to59: number;
  fgMade60Plus: number;
  patMade: number;
  fantasyPoints: number;
  fantasyPointsPerGame: number;
}
