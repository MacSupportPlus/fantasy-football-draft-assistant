export type ScoringFormat = "STD" | "HALF_PPR" | "PPR";

// One entry in FantasyPros' embedded `ecrData.players` array. Field names
// match their JS variable exactly (snake_case, string numbers) since this is
// scraped from an embedded blob, not a documented API.
export interface FantasyProsPlayer {
  player_id: number;
  player_name: string;
  player_team_id: string | null;
  player_position_id: string;
  player_bye_week: string | null;
  player_owned_avg: number | null;
  rank_ecr: number;
  rank_min: string;
  rank_max: string;
  rank_ave: string;
  rank_std: string;
  pos_rank: string;
  tier: number;
}

export interface FantasyProsEcrData {
  sport: string;
  scoring: string;
  year: string;
  last_updated: string;
  players: FantasyProsPlayer[];
}

// Normalized record the rest of the pipeline works with.
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
  scoring: ScoringFormat;
}
