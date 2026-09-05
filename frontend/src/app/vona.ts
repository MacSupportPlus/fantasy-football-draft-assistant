// "Will this player survive to my next pick?" — Value Over Next Available.
// Two pieces: snake-draft pick-gap math (pure, exact), and a survival
// probability estimate (approximate, built on FantasyPros' own rank spread
// — no new data needed).

// The overall pick number (1-indexed) that belongs to slot `mySlot` in a
// given round of a snake draft with `teams` teams.
function pickNumberForRound(round: number, mySlot: number, teams: number): number {
  const roundIsOdd = round % 2 === 1;
  return roundIsOdd ? (round - 1) * teams + mySlot : round * teams - mySlot + 1;
}

// Given how many picks have already happened (`picksMade`), find the next
// overall pick number that's actually mine. Rounds are cheap to loop —
// a full draft is ~16-18 rounds.
export function nextMyPickNumber(picksMade: number, mySlot: number, teams: number): number {
  let round = 1;
  while (true) {
    const pick = pickNumberForRound(round, mySlot, teams);
    if (pick > picksMade) return pick;
    round++;
  }
}

// How many *other* picks happen before my next turn (0 if it's my pick
// right now).
export function picksUntilMyTurn(picksMade: number, mySlot: number, teams: number): number {
  const next = nextMyPickNumber(picksMade, mySlot, teams);
  return Math.max(0, next - (picksMade + 1));
}

// Standard normal CDF via the Abramowitz & Stegun 7.1.26 approximation
// (max error ~1.5e-7) — no stats library needed for this.
function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const poly =
    t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  const prob = 1 - d * poly;
  return x >= 0 ? prob : 1 - prob;
}

// Models a player's "true" draft position as Normal(rankAve, rankStd) —
// FantasyPros' own expert-panel mean and spread — and returns the
// probability their actual draft slot falls *after* `targetPick` (i.e.
// they're still available at that pick). Deterministic fallback (100% or
// 0%) when the spread is negligible or unknown.
export function survivalProbability(
  rankAve: number | null,
  rankStd: number | null,
  targetPick: number
): number | null {
  if (rankAve === null) return null;
  if (rankStd === null || rankStd < 0.5) {
    return rankAve > targetPick ? 1 : 0;
  }
  const z = (targetPick - rankAve) / rankStd;
  return 1 - normalCdf(z);
}
