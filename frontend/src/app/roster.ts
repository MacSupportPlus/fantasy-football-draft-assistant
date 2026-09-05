import type { LeagueSettings } from './league-settings';

export interface PositionNeed {
  position: string; // QB/RB/WR/TE/K/DST/FLEX
  filled: number;
  needed: number;
  satisfied: boolean;
}

const BASE_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'] as const;
const FLEX_ELIGIBLE = ['RB', 'WR', 'TE'] as const;

// Given your roster so far (just positions - names don't matter here) and
// your league's starter requirements, works out what's filled and what's
// still needed per position. RB/WR/TE drafted beyond their own starter
// count spill into the shared FLEX slot rather than counting as "extra."
export function computePositionalNeeds(
  rosterPositions: string[],
  league: LeagueSettings
): PositionNeed[] {
  const counts = new Map<string, number>();
  for (const pos of rosterPositions) {
    counts.set(pos, (counts.get(pos) ?? 0) + 1);
  }

  const results: PositionNeed[] = [];
  let flexPool = 0;

  for (const position of BASE_POSITIONS) {
    const have = counts.get(position) ?? 0;
    const needed = league.starters[position as keyof LeagueSettings['starters']] ?? 0;
    const filled = Math.min(have, needed);
    if ((FLEX_ELIGIBLE as readonly string[]).includes(position) && have > needed) {
      flexPool += have - needed;
    }
    results.push({ position, filled, needed, satisfied: filled >= needed });
  }

  const flexNeeded = league.starters.FLEX;
  const flexFilled = Math.min(flexPool, flexNeeded);
  results.push({
    position: 'FLEX',
    filled: flexFilled,
    needed: flexNeeded,
    satisfied: flexFilled >= flexNeeded,
  });

  return results;
}
