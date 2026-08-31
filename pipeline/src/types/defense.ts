// Team defense (D/ST) season aggregate, built from nflverse's team-level
// stats file plus game results (for points-allowed, which isn't a per-team
// counting stat — it depends on what the *opponent* scored each week).
// Unlike offense, D/ST scoring doesn't vary by PPR/Half-PPR/Standard, so
// there's just one fantasyPoints number instead of three.
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
  fantasyPoints: number;
  fantasyPointsPerGame: number;
}
