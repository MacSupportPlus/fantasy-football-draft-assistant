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

  // Opportunity/efficiency metrics (season averages of nflverse's weekly
  // values) — more forward-looking than raw fantasy points, since a rising
  // target share can show up before it's reflected in scoring. 0 for
  // players with no receiving/passing volume that season.
  targetShare: number;
  airYardsShare: number;
  wopr: number; // "weighted opportunity rating" - nflverse's blend of target share + air yards share
}
