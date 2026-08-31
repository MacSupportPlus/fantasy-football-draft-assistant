# Build Log

A running explanation of what's been built, why it's built that way, and what
each piece actually does under the hood. The [README](README.md) is the
quick-reference; this is the "how and why" version — including, in detail,
how a player's score actually gets computed.

## The idea in one paragraph

Most draft tools rank players by projected fantasy points. That's misleading
in a snake draft, because points aren't what you're actually short on —
*replacement-level talent* is. A QB scoring 300 points looks good until you
notice the 12th-best QB (the one anyone can pick up on a whim) scores 280.
A RB scoring 200 points looks bad until you notice the 24th-best RB scores 90.
**Value-based drafting (VBD)** ranks players by points *above* what you could
get for free at their position — so it correctly says "draft the RB, not the
QB" even though the QB's raw total is higher. Everything here exists to
compute that number, live, during an actual draft, using *your* league's
exact roster size and scoring rules — not a generic default.

## Why no backend

The whole app runs as static files. A data pipeline (currently run manually;
a scheduled GitHub Action is the planned next step) calls APIs, scrapes
pages, and joins datasets on a schedule, committing the results as JSON into
this repo. The Angular frontend reads that JSON directly and does all the
ranking math and live draft-state tracking in the browser. Nothing costs
money because nothing runs continuously.

## Repo map

```
pipeline/            Node/TypeScript data pipeline — see "How a score gets
                      computed" below for what each script does
  src/
    sources/          One module per external data source
    types/            Shared TypeScript types, one file per data shape
    vbd/              The actual VBD math (projection + replacement level)
data/processed/       Every intermediate and final JSON artifact, committed
                      to the repo so the frontend can read it as a static file
frontend/             Angular 19 app — the draft board UI
```

## What's built so far

### 1. Sleeper player pipeline (`pipeline/src/fetch-players.ts`)

Sleeper's `/v1/players/nfl` endpoint returns one giant dictionary — every
player who's ever touched an NFL roster, ~12,000 entries. Filtered down to
players who are (a) a fantasy-relevant position (QB/RB/WR/TE/K/DEF) and (b)
currently on a team. That leaves **992 players** — this is the anchor list
everything else gets matched against.

**Quirk found:** Sleeper's `status`/`active` fields aren't reliable signals
of "is this guy actually playing." Ben Roethlisberger — retired since 2022 —
still shows up with `status: Active`.

### 2. FantasyPros consensus rankings (`pipeline/src/sources/fantasypros.ts`)

FantasyPros has no public API, but their rankings pages
(`fantasypros.com/nfl/rankings/*-cheatsheets.php`) embed the entire ranking
table as a `var ecrData = {...}` blob in an inline `<script>` tag. The
pipeline fetches the page's HTML as plain text and pulls that JSON blob out
directly — no headless browser needed.

Fetched once per scoring format (Standard/Half-PPR/PPR). Each entry includes
expert consensus rank (ECR), a **tier** (players FantasyPros groups as
roughly equal value), and **rank spread** (min/max/std-dev across experts —
a wide spread flags a contested/boom-or-bust player).

**Dead end worth knowing about:** FantasyPros' actual ADP page is a
client-side React table with no embedded data and no discoverable API —
would need a real headless browser (not available here). The rankings pages
turned out to be a fine substitute — arguably better, since ECR/tier reflect
consensus *value*, while ADP just reflects what other drafters already do.

### 3. nflverse historical stats (`pipeline/src/fetch-stats.ts`)

Downloads nflverse's `player_stats.csv` (weekly stats, every player, every
season back to 1999 — ~30MB) and aggregates to **per-player, per-season
totals** for the last 3 regular seasons (currently 2022–2024). Keeps raw
counting stats (targets, carries, receptions, yards, TDs) and fantasy points
in Standard/Half-PPR/PPR.

**Technical snag:** the CSV has quoted fields with embedded commas (player
names, mostly), which breaks naive `split(',')` parsing. Wrote a small
proper CSV parser (`pipeline/src/util/csv.ts`) instead of pulling in a
library for it.

**Quirk found:** nflverse's file currently tops out at 2024 — hasn't been
updated for 2025 yet, so "last 3 seasons" is 2022–2024, not 2023–2025.

**Left on the table:** the raw file also has `target_share`,
`air_yards_share`, `wopr` (weighted opportunity rating), `racr`, and
EPA-based efficiency metrics per player-week — none of these make it into
the aggregated output currently. See "Making the scores better" below.

### 4. Player ID crosswalk (`pipeline/src/build-crosswalk.ts`)

None of the three sources share an ID — Sleeper, FantasyPros, and nflverse
(`gsis_id`) all use their own. Joins all three on normalized name + position
(team as a tie-breaker), via `pipeline/src/util/normalize.ts`:
- Lowercases, strips punctuation/apostrophes/periods, collapses hyphens to
  spaces, strips diacritics.
- Strips trailing suffixes (Jr./Sr./II/III/IV/V).
- Maps position labels across sources (Sleeper's `DEF` ↔ FantasyPros' `DST`).
- Maps team abbreviation drift (FantasyPros' `JAC`, nflverse's `LA` for the
  Rams) as a tie-breaker only.

Sleeper is the anchor — every one of the 992 players gets a crosswalk row,
with `fantasyProsId`/`gsisId` filled in wherever a confident match landed.

**Results:** 839/942 FantasyPros entries matched, 451/930 nflverse players
matched, **428 players have all three IDs**. (D/ST and K, added later, are
matched separately by team rather than through this crosswalk — see below.)
Unmatched entries get written to `crosswalk-unmatched.json` instead of
silently dropped.

**Known limitation:** most unmatched nflverse entries are legitimately
retired players (Tom Brady, Julio Jones — correctly excluded). But a real
gap exists for **nicknames**: FantasyPros lists "Hollywood Brown," Sleeper
lists "Marquise Brown" — same active player, missed because the names don't
match after normalization. A name-based join can't fully close that gap.

### 5. Team defense stats (`pipeline/src/fetch-team-defense.ts`)

nflverse's `stats_team` release has season-level sacks/INTs/fumble
recoveries/defensive TDs/blocked kicks per team, but two scoring components
needed extra joins because they depend on what the *opponent* did, not a
simple team total:

- **Points allowed** — joined against nflverse's `games.csv` (every game,
  every season, with final scores). For each game, the home team "allowed"
  the away team's score that week, and vice versa.
- **Yards allowed** — joined against nflverse's *weekly* team stats file
  (`stats_team_week_{year}.csv`), which conveniently includes an
  `opponent_team` column. A team's yards allowed that week = its opponent's
  own passing + rushing yards that week.

Both get converted to a per-game score using **this league's exact tiers**
(not a generic default — see "This league's exact scoring rules" below),
summed across the season alongside the straightforward counting stats.

**Validated:** Denver's historically elite 2024 defense correctly lands at
#1; Carolina/Patriots/Titans (real bottom-tier 2024 defenses) at the bottom.

**Worth knowing:** D/ST performance is much less consistent year-to-year
than a skill player's. The projection still weights "how this defense
actually performed" heavily, which can rank a defense higher than most real
drafters would take one — a limitation of applying the same model to a less
persistent position, not a bug.

### 6. Kicker stats (`pipeline/src/fetch-kickers.ts`)

nflverse has **no per-kicker stats anywhere** — but the same `stats_team`
file has team-level field-goal-by-distance and PAT data, which is enough to
score this league's exact kicker rules once you know them. This makes
kickers rankable as a **team-level proxy** for whoever kicks there.

**Validated:** Brandon Aubrey and Chris Boswell (real top-tier 2024
accuracy) correctly top the board.

**Real limitation, not a rounding error:** since this is team data, not
individual data, a kicker who just changed teams gets projected off his
*new* team's kicking history, not his own. There's no way to fix this without
individual kicker stats, which nflverse simply doesn't have.

## How a score gets computed

This is the actual point of the project, so here it is in full — two
stages: **project points**, then **subtract replacement level**.

### Stage 1 — projecting points

**Players with NFL history (`pipeline/src/vbd/project-points.ts`):**
Take up to the last 3 completed seasons, weight them by recency, and blend:

| Seasons available | Weights (most recent first) |
|---|---|
| 3 | 50% / 30% / 20% |
| 2 | 60% / 40% |
| 1 | 100% |

1. Weighted points-per-game = Σ(weight × that season's PPG)
2. Weighted games estimate = Σ(weight × that season's games played), capped
   at 17 — this is the model's only injury-risk signal: a player who missed
   time recently gets a lower games estimate automatically, without any
   explicit "is he injured" flag.
3. **Projected points = weighted PPG × weighted games estimate.**

Worked example (Josh Allen, PPR — verified against the actual output):

| Season | PPG | Games | Weight |
|---|---|---|---|
| 2024 | 23.27 | 16 | 50% |
| 2023 | 23.21 | 17 | 30% |
| 2022 | 24.72 | 16 | 20% |

Weighted PPG = 0.5×23.27 + 0.3×23.21 + 0.2×24.72 = **23.54**
Weighted games = 0.5×16 + 0.3×17 + 0.2×16 = **16.3**
Projection = 23.54 × 16.3 ≈ **383.8 points** — the pure recency-weighted number.

That raw number then passes through several more adjustment layers before
it's final — regression to the mean, a blend with FantasyPros' consensus
rank, age, injury status, opportunity trend, and strength of schedule. Full
detail, including a real bug caught and fixed while building this, is in
**"Making the scores better" below** rather than duplicated here.

**Players with no usable NFL history** (rookies, practice-squad call-ups):
there's nothing to weight, so the projection is *interpolated* instead:
1. Build a "FantasyPros position rank → projected points" curve, using only
   players who have both real stats *and* an FP rank (i.e., the players
   from stage 1 above).
2. Find where the new player's FP position rank (e.g. "WR23") falls on that
   curve, and linearly interpolate between the two nearest anchor points.

These show an **"est."** badge in the UI so they're visually distinct from a
real, stats-backed projection — the confidence is genuinely lower.

**D/ST and kickers** use the identical recency-weighted formula, just on
team-level data instead of individual data (see sections 5–6 above for why).

### Stage 2 — replacement level & VBD score

Every player now has a projected point total. The question VBD answers is:
*what's a replacement-level player at this position* — the best player
you could still get for free off waivers if you drafted nobody there?

That's controlled entirely by your league settings
(`pipeline/src/vbd/replacement.ts`, and duplicated for the browser in
`frontend/src/app/league-settings.ts`):

```
14 teams
Starters: 1 QB, 2 RB, 2 WR, 1 TE, 1 FLEX (RB/WR/TE), 1 K, 1 D/ST
FLEX attributed: 50% RB, 40% WR, 10% TE
```

**Replacement rank** for a position = (teams × starters at that position) +
a share of the FLEX slots. Example for RB: 14 teams × 2 starting RBs = 28,
plus 14 × 1 FLEX × 50% ≈ 7 → **replacement rank ≈ 35th-best RB.** Whatever
that 35th-ranked RB is projected for *is* the replacement value for RB.

**VBD score = player's projected points − replacement value at their
position.**

This is why a 200-point RB can outrank a 300-point QB: if replacement-level
QBs project for 260 (there are only 14 needed and dozens of viable backups)
but replacement-level RBs project for 90 (starting-caliber RBs are scarce),
the RB's VBD (200−90=110) beats the QB's (300−260=40) despite scoring fewer
raw points. **Sorting by VBD score, not raw points, is the entire draft
board.**

### Live re-ranking (the part that makes this a *draft* tool, not a list)

`frontend/src/app/services/draft-board.service.ts` duplicates the
replacement-level math (not the projection math — that's fixed once
computed) and recalculates it every time a player gets marked drafted.
As players vanish from a position, the replacement rank shifts to whoever's
now the Nth-best *remaining* player there — so if RBs are getting drafted
fast, every remaining RB's VBD score rises in real time, signaling "this
position is drying up, prioritize it now."

## This league's exact scoring rules

Pulled directly from your ESPN league settings (2026-08-31), not assumed:

- **Passing:** 0.04/yd, 4/TD, -2/INT, 2/2pt
- **Rushing:** 0.1/yd, 6/TD, 2/2pt
- **Receiving:** 0.1/yd, 1/reception (full PPR), 6/TD, 2/2pt
  — this matches nflverse's own `fantasy_points_ppr` formula almost exactly,
  which is why the offensive projections needed no scoring adjustment at all.
- **Kicking:** PAT=1, FG 0-39=3, 40-49=4, 50-59=5, 60+=6, miss=-1
- **D/ST:** sack=1, INT=2, fumble recovered=2, safety=2, TD=6, blocked
  kick=2, points-allowed tiers (0=5, 1-6=4, 7-13=3, 14-17=1, 18-27=0,
  28-34=-1, 35-45=-3, 46+=-5), yards-allowed tiers (<100=5, 100-199=3,
  200-299=2, 300-349=0, 350-399=-1, 400-449=-3, 450-499=-5, 500-549=-6,
  550+=-7)
- **Roster:** 14 teams, 1 QB / 2 RB / 2 WR / 1 TE / 1 FLEX / 1 K / 1 D/ST

## The frontend

Standalone Angular 19 app (`frontend/`) — `angular.json` maps
`../data/processed` to `/data` as a build asset, so it reads the pipeline's
JSON directly with zero duplication.

- **Draft board table** — scoring format toggle, position filter, search,
  draft/undo buttons. `DraftBoardService` persists drafted state in
  localStorage and live-recomputes VBD (see above) as players get drafted.
- **Player card** (`components/player-card.component.*`) — click a name to
  see projected points, VBD score, FantasyPros ECR/tier, and a plain-English
  explanation of the projection with the actual season-by-season numbers and
  weights used, generated by `services/player-detail.service.ts`.
- **Dark "draft day" visual theme**, tier-colored position badges.

## Running it all

```bash
cd pipeline
npm install
npm run fetch:sleeper       # -> data/processed/players.json
npm run fetch:rankings      # -> data/processed/rankings-{std,half-ppr,ppr}.json
npm run fetch:stats         # -> data/processed/stats-by-season.json
npm run fetch:team-defense  # -> data/processed/defense-stats-by-season.json
npm run fetch:kickers       # -> data/processed/kicker-stats-by-season.json
npm run build:crosswalk     # -> data/processed/player-crosswalk.json
npm run build:vbd           # -> data/processed/vbd-rankings-{std,half-ppr,ppr}.json

cd ../frontend
npm install
npm start                   # -> http://localhost:4200
```

Order matters: crosswalk needs the first three fetch outputs; build:vbd
needs the crosswalk plus the defense/kicker stats.

## Making the scores better

Everything below started as a prioritized wishlist and has since been built
(items 1–7). Order of operations for the final projection, all in
`pipeline/src/vbd/project-points.ts` unless noted:

**raw recency-weighted rate → regression to the mean → blend with FantasyPros
rank → × age multiplier → × injury multiplier → × opportunity-trend
multiplier → × strength-of-schedule multiplier → final projected points**

1. ✅ **Blend expert judgment into every projection, not just rookies'.**
   FantasyPros' consensus rank is now blended into *every* history-based
   player's projection at a fixed 20% weight (`BLEND_WEIGHT` in
   `project-points.ts`), using the same rank→points curve built for the
   rookie-interpolation fallback. Previously only rookies got this signal.

2. ✅ **Age.** `pipeline/src/vbd/adjustments.ts` → `ageMultiplier()`. Position-
   specific decline curves (RB from 27, WR/TE from 30, QB from 38), reading
   Sleeper's `age` field that was previously fetched and ignored.

3. ✅ **Injury status.** Same file → `injuryMultiplier()`. Discounts
   Out/IR/PUP/Suspended (-25%), Doubtful (-15%), Questionable (-5%), using
   Sleeper's `injuryStatus` field.

4. ✅ **Opportunity/efficiency metrics.** `fetch-stats.ts` now captures
   `target_share`, `air_yards_share`, and `wopr` (season averages) into
   `stats-by-season.json`. `opportunityTrendMultiplier()` compares the two
   most recent seasons' WOPR and nudges the projection (±8% max, dampened)
   for a rising or falling opportunity trend a trailing-points average
   wouldn't reflect yet.

5. ✅ **Regress small samples toward the mean.** Each player's rate is
   shrunk toward their position's average rate, weighted by how many
   weighted games of their own history they have. **Real bug found while
   building this:** the first version computed the "positional average"
   across *every* player with any history — every position has a long tail
   of career backups with a handful of snaps, which drags the average down
   to something no actual starter resembles. Josh Allen's projection
   dropped from 383.8 to 297 before this was caught. Fixed by restricting
   the reference mean to players with a real starter-level sample (≥12
   weighted games) and easing the shrinkage weight — Allen now lands at
   339.7, a modest, defensible pull instead of a severe distortion.

6. ✅ **Strength of schedule.** `pipeline/src/vbd/strength-of-schedule.ts`.
   Pulls next season's schedule from `games.csv`, uses each team's own
   D/ST fantasy output as a "how tough is this defense" proxy, and applies
   a bounded (±6%) adjustment to QB/RB/WR/TE based on how their upcoming
   opponents compare to league average. Explicitly a coarse first pass —
   it's whole-team strength, not position-specific matchup data (it
   doesn't know a defense is bad against the pass but good against the
   run).

7. ✅ **Close the nickname gap in the crosswalk.** `build-crosswalk.ts` now
   uses the community-maintained `dynastyprocess/data` ID crosswalk
   (`pipeline/src/sources/dynastyprocess.ts`) as the *primary* join —
   direct Sleeper-ID → FantasyPros/gsis-ID lookup, no name-matching. Name
   matching still runs as a fallback for whatever it doesn't cover (mainly
   D/ST, since defenses aren't individual players). gsis matches nearly
   doubled (451 → 819); "Hollywood"/Marquise Brown resolves correctly now.

8. **Not built — the D/ST and K "team proxy" ceiling.** Both are capped by
   nflverse having no individual-level data for these positions. A real
   fix means parsing raw play-by-play to attribute kicks/sacks/turnovers to
   individual players — a materially bigger, messier data source than
   anything else here. Worth doing only if K/DST accuracy turns out to
   matter to how the draft actually goes.

All the constants involved (blend weight, shrinkage strength, starter-game
threshold, age curve slopes, SOS bound) are deliberately modest and
documented inline — they're reasonable first-pass assumptions, not fitted
to anything. Worth revisiting if a position's rankings look off once real
draft season data starts rolling in.

## What's next

1. **GitHub Action** — wire the pipeline scripts into a scheduled workflow
   so data refreshes automatically.
2. **Deploy to Vercel/Netlify.**
3. Item 8 above, if K/DST accuracy turns out to matter.
