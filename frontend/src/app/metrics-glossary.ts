// Single source of truth for every metric/column explanation in the app —
// used by the info-icon tooltips (inline, one-line) and the glossary page
// (full explanation). Keep both in sync here, not duplicated at call sites.
export interface MetricDefinition {
  label: string;
  short: string; // one line, shown in the inline tooltip
  long: string; // full explanation, shown on the glossary page
}

// Indexed as a partial map (a bad key genuinely returns undefined at
// runtime) via getMetric() below, rather than Record<string, ...> which
// would tell TypeScript every key always resolves.
export function getMetric(key: string): MetricDefinition | undefined {
  return METRICS[key];
}

export const METRICS: Record<string, MetricDefinition> = {
  overallRank: {
    label: 'Rank',
    short: 'Overall draft-board rank, sorted by VBD score across all positions.',
    long: 'Every rankable player, sorted by VBD score (not raw projected points) regardless of position. This is the actual pick order the app is recommending. It updates live as players get drafted — replacement value shifts as each position thins out, so remaining players re-rank in real time.',
  },
  positionRank: {
    label: 'Pos#',
    short: 'Rank within this position only, by our VBD score.',
    long: 'Where this player ranks among only their own position (all QBs, all RBs, etc.), sorted by our VBD score. Like the overall rank, this recomputes live as players at the position get drafted.',
  },
  position: {
    label: 'Pos',
    short: 'QB, RB, WR, TE, K, or D/ST (team defense).',
    long: 'The scoring position. D/ST is a whole team defense/special-teams unit, not an individual player — it and K are matched to team-level historical data rather than individual player stats (see Proj Pts).',
  },
  team: {
    label: 'Team',
    short: "The player's current NFL team.",
    long: "The player's current NFL team, from Sleeper's roster data. For D/ST, this is simply the team itself.",
  },
  projectedPoints: {
    label: 'Proj Pts',
    short: 'Projected fantasy points for a full season in this scoring format, after all adjustments.',
    long: 'Starts from a recency-weighted average of the player\'s last up-to-3 seasons (most recent season weighted highest), scaled by a similarly-weighted games-played estimate. That raw number then passes through several adjustments: regression toward the position average for players with a thin sample, a blend with FantasyPros\' consensus rank (expert context a stats-only model can\'t see — trades, scheme changes, injury outlook), an age-curve multiplier, an injury-status discount, an opportunity-trend adjustment (rising or falling target share), and a bounded strength-of-schedule nudge based on next season\'s opponents. Players with no NFL history (rookies) skip straight to an estimate interpolated from FantasyPros\' rank instead — see the "est." badge.',
  },
  vbdScore: {
    label: 'VBD',
    short: 'Projected points above replacement level at this position — what the board is actually sorted by.',
    long: "Value Over Replacement: this player's projected points minus the projected points of a replacement-level player at the same position (the best player you could still get for free if you drafted nobody there — see Replacement). This is the whole point of value-based drafting: it correctly says a scarce position's mid-tier player can be worth more than a deep position's raw point leader. Sorting by VBD, not raw points, is what makes this a draft board instead of a projections list.",
  },
  replacementValue: {
    label: 'Replacement',
    short: 'Projected points of the last startable player at this position in your league.',
    long: "The projected points of the player at the \"replacement rank\" for this position — computed from your league's actual settings (14 teams, 1 QB / 2 RB / 2 WR / 1 TE / 1 FLEX / 1 K / 1 D/ST, with FLEX split 50% RB / 40% WR / 10% TE). For RB that's roughly the 35th-best RB. This baseline is recalculated live as players get drafted, using whoever's still available.",
  },
  fpPositionRank: {
    label: 'FP Rank',
    short: "FantasyPros' consensus expert rank within this position — the source data, before our math.",
    long: "FantasyPros' Expert Consensus Rank (ECR) within this position, scraped directly from their rankings pages — a panel of fantasy analysts' averaged opinion. This is the raw input our model partly builds on (20% blend weight into every projection) and partly starts from scratch on (recency-weighted stats). Comparing this to our own Pos# rank shows exactly where and how much we disagree with generic consensus.",
  },
  rankDelta: {
    label: 'Δ (Delta)',
    short: 'How much better or worse we rate this player vs. FantasyPros consensus, in rank spots.',
    long: "FantasyPros' position rank number minus our own position rank number. Positive means we rate the player better than consensus does (fewer spots = better in our ranking); negative means we rate them worse. A large delta is worth a second look at the player card to see why — it usually comes down to recent stats disagreeing with expert opinion, an injury/age adjustment, or a strength-of-schedule swing.",
  },
  source: {
    label: 'est. badge',
    short: 'No usable NFL stats — projection is estimated from FantasyPros rank instead.',
    long: "Shown for players with no usable NFL history (rookies, practice-squad call-ups). Since there's no trailing-stats basis for a projection, the number is interpolated from where the player's FantasyPros position rank falls against comparable players who do have real stats. Treat these as lower-confidence than a stats-backed projection.",
  },
  ecr: {
    label: 'ECR',
    short: "FantasyPros' Expert Consensus Rank — the average rank across their analyst panel.",
    long: "FantasyPros' Expert Consensus Rank: the average overall rank given by their panel of fantasy analysts, aggregated across all positions (not just within one position — that's the position rank shown elsewhere).",
  },
  tier: {
    label: 'Tier',
    short: 'FantasyPros groups players of roughly equal value into the same tier.',
    long: "FantasyPros clusters players into tiers of roughly equivalent value based on where their expert panel's rankings show natural gaps. Two players in the same tier are considered close enough that the pick order between them matters less than the tier boundary itself — a common real-draft heuristic is \"take the last player in a tier before it closes,\" not just \"take the single highest-ranked name.\"",
  },
  rankSpread: {
    label: 'Expert range',
    short: 'The most optimistic to most pessimistic rank any single expert gave this player.',
    long: "The minimum and maximum rank any individual FantasyPros analyst gave this player. A narrow range means the experts agree; a wide range flags real disagreement — often a boom/bust or contested-role player where you might reasonably rank them very differently than consensus depending on your own read.",
  },
  rosteredPct: {
    label: 'Rostered %',
    short: 'Percentage of leagues where this player is currently on a roster.',
    long: "FantasyPros' rostered percentage across the leagues they track — a rough popularity/relevance signal independent of our own ranking.",
  },
  byeWeek: {
    label: 'Bye week',
    short: "The week this player's team doesn't play.",
    long: 'The NFL week during which this team has no game. Useful for making sure your bench has coverage — avoid stacking too many starters at the same position with the same bye week.',
  },
  seasonWeight: {
    label: 'Weight',
    short: 'How much this season counts toward the projection — recent seasons count more.',
    long: 'The recency weight applied to this season when computing the projection. With 3 seasons of history, the split is 50% most recent / 30% / 20% oldest; with 2 seasons, 60/40; with 1 season, 100%. More recent performance is a better predictor of next season than older performance, so it counts more.',
  },
};
