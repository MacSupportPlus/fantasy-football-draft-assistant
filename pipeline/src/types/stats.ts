// Season-level aggregate built from nflverse's weekly player_stats.csv
// (regular season only). player_id here is nflverse's gsis_id
// ("00-0033077" style) — not the Sleeper or FantasyPros IDs.
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
