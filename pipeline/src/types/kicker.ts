// Kicker season aggregate. nflverse has no per-kicker stats anywhere, so
// this is derived from TEAM-level field-goal/PAT data as a proxy for
// "whoever kicked for this team" — it's not tied to an individual kicker's
// gsis_id. If a team changed kickers, this reflects the team's kicking
// output, not necessarily the currently-rostered kicker's own history. See
// the caveat in README.md before trusting this too far for a player who
// just changed teams.
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
