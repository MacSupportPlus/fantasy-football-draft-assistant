// Adjustment multipliers applied on top of the base recency-weighted
// projection. Each is a deliberately modest, bounded nudge based on
// well-documented fantasy-analytics patterns — not a fitted regression
// model. Tune the constants here if they don't feel right; the point is
// that these signals (age, injury status, opportunity trend) exist in data
// we already have and were previously just thrown away.

// Aging curves: RBs decline sharply and early, WRs/TEs later and more
// gradually, QBs barely at all until their late 30s. K/DST aren't
// age-adjusted (DST isn't an individual; K is a team-level proxy anyway).
export function ageMultiplier(position: string, age: number | null): number {
  if (age === null) return 1;

  switch (position) {
    case "RB":
      return age <= 26 ? 1 : Math.max(0.6, 1 - 0.04 * (age - 26));
    case "WR":
      return age <= 29 ? 1 : Math.max(0.7, 1 - 0.025 * (age - 29));
    case "TE":
      return age <= 29 ? 1 : Math.max(0.7, 1 - 0.03 * (age - 29));
    case "QB":
      return age <= 37 ? 1 : Math.max(0.75, 1 - 0.03 * (age - 37));
    default:
      return 1;
  }
}

const INJURY_DISCOUNT: Record<string, number> = {
  Out: 0.75,
  IR: 0.75,
  PUP: 0.75,
  NA: 0.75,
  Suspended: 0.75,
  Doubtful: 0.85,
  Questionable: 0.95,
};

// A discount, not an exclusion - "Out" doesn't mean "never plays," it means
// "materially more risk than a healthy player with the same trailing stats."
export function injuryMultiplier(status: string | null): number {
  if (!status) return 1;
  return INJURY_DISCOUNT[status] ?? 1;
}

const MAX_TREND_ADJUSTMENT = 0.08;
const TREND_DAMPENING = 0.3;

// Compares the two most recent seasons' WOPR (nflverse's blended target
// share + air yards share metric) and nudges the projection for a rising
// or falling opportunity trend that a trailing points average wouldn't
// otherwise reflect yet. Only meaningful for RB/WR/TE; QB/K/DST pass in
// null WOPR values and get no adjustment.
export function opportunityTrendMultiplier(
  mostRecentWopr: number | null,
  priorWopr: number | null
): number {
  if (mostRecentWopr === null || priorWopr === null) return 1;
  if (priorWopr <= 0.01) return 1; // avoid dividing by ~0 on a barely-used player

  const rawTrendPct = (mostRecentWopr - priorWopr) / priorWopr;
  const dampened = rawTrendPct * TREND_DAMPENING;
  const clamped = Math.max(-MAX_TREND_ADJUSTMENT, Math.min(MAX_TREND_ADJUSTMENT, dampened));
  return 1 + clamped;
}
