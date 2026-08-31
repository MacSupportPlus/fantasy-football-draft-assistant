// Mirrors pipeline/src/vbd/replacement.ts — same league assumptions, same
// replacement-rank formula, duplicated here (not imported) since this runs
// in the browser rather than the Node pipeline. Keep the two in sync if
// either changes.
export interface LeagueSettings {
  teams: number;
  starters: {
    QB: number;
    RB: number;
    WR: number;
    TE: number;
    FLEX: number;
    K: number;
    DST: number;
  };
  flexShare: { RB: number; WR: number; TE: number };
}

export const DEFAULT_LEAGUE_SETTINGS: LeagueSettings = {
  teams: 14,
  starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DST: 1 },
  flexShare: { RB: 0.5, WR: 0.4, TE: 0.1 },
};

const FLEX_ELIGIBLE = ['RB', 'WR', 'TE'] as const;

export function replacementRank(position: string, league: LeagueSettings): number {
  const starterCount =
    league.starters[position as keyof LeagueSettings['starters']] ?? 0;
  const base = league.teams * starterCount;

  if ((FLEX_ELIGIBLE as readonly string[]).includes(position)) {
    const share = league.flexShare[position as keyof LeagueSettings['flexShare']] ?? 0;
    return base + Math.round(league.teams * league.starters.FLEX * share);
  }
  return base;
}
