import type { LeagueSettings, ProjectedPlayer } from "../types/vbd.js";

// Standard 12-team league, single QB, standard FLEX. Edit this to match
// your actual draft — it's the single biggest lever in VBD, since it
// decides where "replacement level" falls at every position.
export const DEFAULT_LEAGUE_SETTINGS: LeagueSettings = {
  teams: 12,
  starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DST: 1 },
  flexShare: { RB: 0.5, WR: 0.4, TE: 0.1 },
};

const FLEX_ELIGIBLE = ["RB", "WR", "TE"] as const;

function replacementRank(position: string, league: LeagueSettings): number {
  const starterCount =
    league.starters[position as keyof LeagueSettings["starters"]] ?? 0;
  const base = league.teams * starterCount;

  if ((FLEX_ELIGIBLE as readonly string[]).includes(position)) {
    const share = league.flexShare[position as keyof LeagueSettings["flexShare"]] ?? 0;
    return base + Math.round(league.teams * league.starters.FLEX * share);
  }
  return base;
}

// The replacement value at a position is the projected points of the last
// startable player there — the (teams * starters + flex share)-th ranked
// player. Falls back to the worst available player if the position is
// thinner than the theoretical baseline rank (e.g. TE in a shallow pool).
export function computeReplacementValues(
  playersByPosition: Map<string, ProjectedPlayer[]>,
  league: LeagueSettings = DEFAULT_LEAGUE_SETTINGS
): Map<string, number> {
  const replacementValues = new Map<string, number>();

  for (const [position, players] of playersByPosition) {
    const sorted = [...players].sort(
      (a, b) => b.projectedPoints - a.projectedPoints
    );
    const rank = replacementRank(position, league);
    const index = Math.min(rank, sorted.length) - 1;
    replacementValues.set(position, sorted[Math.max(index, 0)]?.projectedPoints ?? 0);
  }

  return replacementValues;
}
