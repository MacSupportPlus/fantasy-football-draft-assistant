// Shape of a single entry in Sleeper's /v1/players/nfl dictionary.
// Sleeper doesn't document this formally; fields below are the ones that
// show up reliably. Treat anything not listed here as unstable.
export interface SleeperPlayer {
  player_id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  fantasy_positions: string[] | null;
  team: string | null;
  status: string | null; // "Active", "Inactive", "Injured Reserve", etc.
  injury_status: string | null;
  active: boolean;
  years_exp: number | null;
  age: number | null;
  height: string | null;
  weight: string | null;
  college: string | null;
  number: number | null;
  depth_chart_order: number | null;
  depth_chart_position: string | null;
  search_rank: number | null;
}

export type SleeperPlayerMap = Record<string, SleeperPlayer>;

// Fantasy-relevant positions we keep for the draft assistant.
export const FANTASY_POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"] as const;
export type FantasyPosition = (typeof FANTASY_POSITIONS)[number];

// Normalized record the rest of the pipeline (and eventually the frontend) works with.
export interface Player {
  id: string;
  name: string;
  position: FantasyPosition;
  team: string | null;
  status: string | null;
  injuryStatus: string | null;
  yearsExp: number | null;
  age: number | null;
  searchRank: number | null;
}
