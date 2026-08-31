// Team defense (D/ST) season aggregate, built from nflverse's team-level
// stats file plus game results (for points-allowed) and weekly team stats
// (for yards-allowed) — neither is a simple per-team counting stat, since
// both depend on what the *opponent* did each week. Scoring matches this
// league's exact rules (league settings pasted 2026-08-31), not a generic
// default — see fetch-team-defense.ts for the point values.
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
