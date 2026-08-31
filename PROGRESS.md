# Build Log

A running explanation of what's been built, why it's built that way, and what
each piece actually does under the hood. The [README](README.md) is the
quick-reference; this is the "how and why" version.

## The idea in one paragraph

Most draft tools rank players by projected fantasy points. That's misleading
in a snake draft, because points aren't what you're actually short on —
*replacement-level talent* is. A QB scoring 300 points looks good until you
notice the 12th-best QB (the one anyone can pick up on a whim) scores 280.
A RB scoring 200 points looks bad until you notice the 24th-best RB scores 90.
**Value-based drafting (VBD)** ranks players by points *above* what you could
get for free at their position — so it correctly says "draft the RB, not the
QB" even though the QB's raw total is higher. Everything being built here
exists to compute that number, live, during an actual draft.

## Why no backend

The whole app runs as static files. A **scheduled GitHub Action** does the
heavy lifting (calling APIs, scraping pages, joining datasets) on a schedule
and commits the results as JSON into this repo. The **Angular frontend**
(not built yet) just reads that JSON and does all the ranking math and
live draft-state tracking in the browser. Nothing costs money because
nothing runs continuously — the Action runs for a few seconds on a timer,
and the frontend is static files on Vercel/Netlify's free tier.

## What's built so far

### 1. Sleeper player pipeline (`pipeline/src/fetch-players.ts`)

Sleeper's `/v1/players/nfl` endpoint returns one giant dictionary — every
player who's ever touched an NFL roster, ~12,000 entries. Most of that is
noise (retired players, practice-squad nobodies, long-shot free agents), so
the script filters down to players who are (a) a fantasy-relevant position
(QB/RB/WR/TE/K/DEF) and (b) currently on a team. That leaves **992 players**.

**Quirk found:** Sleeper's `status`/`active` fields aren't reliable signals
of "is this guy actually playing." Ben Roethlisberger — retired since 2022 —
still shows up with `status: Active`. The data is stale in a specific way;
noted so it doesn't cause confusion later.

### 2. FantasyPros consensus rankings (`pipeline/src/sources/fantasypros.ts`)

FantasyPros has no public API. But their rankings pages
(`fantasypros.com/nfl/rankings/*-cheatsheets.php`) are server-rendered and
embed the entire ranking table as a `var ecrData = {...}` blob in an inline
`<script>` tag — the same data their own JS uses to draw the table, just
readable without executing any JavaScript. The pipeline fetches the page's
HTML as plain text and pulls that JSON blob out directly.

This is fetched once per scoring format (**Standard**, **Half-PPR**, **PPR**)
since rankings shift meaningfully by format — e.g. pass-catching RBs jump in
PPR. Each entry includes expert consensus rank (ECR), a **tier** (how FantasyPros
groups players of similar value — useful for "does it matter if I take this
guy now vs. 5 picks later"), and **rank spread** (min/max/std-dev across
experts — a wide spread flags a contested/boom-or-bust player).

**Dead end worth knowing about:** FantasyPros' actual ADP page
(`/nfl/adp/overall.php`) is a client-side React table with no embedded data
and no discoverable API — scraping it would need a real headless browser
(Playwright), which isn't available in this environment. The rankings pages
turned out to be a fine substitute — arguably better, since ECR/tier reflect
consensus *value*, while ADP just reflects what other drafters already do.

### 3. nflverse historical stats (`pipeline/src/fetch-stats.ts`)

Downloads nflverse's `player_stats.csv` (weekly stats, every player, every
season back to 1999 — about 30MB) and aggregates it down to **per-player,
per-season totals** for the last 3 regular seasons (currently 2022–2024).
Keeps both raw counting stats (targets, carries, receptions, etc.) and
fantasy points in Standard/Half-PPR/PPR.

**Technical snag:** the CSV has quoted fields with embedded commas (player
display names, mostly), which breaks naive `split(',')` parsing — columns
silently shift and the data looks corrupted. Wrote a small proper CSV parser
(`pipeline/src/util/csv.ts`) that respects quotes instead of pulling in a
library for it.

**Quirk found:** nflverse's file currently tops out at the 2024 season —
it hasn't been updated for 2025 yet, so "last 3 seasons" is presently
2022–2024, not 2023–2025. Worth re-checking once the frontend is live.

### 4. Player ID crosswalk (`pipeline/src/build-crosswalk.ts`)

The hard part: **none of the three sources share an ID.** Sleeper has its
own player IDs, FantasyPros has its own, and nflverse uses the NFL's official
`gsis_id`. To combine "Sleeper says he's on this team" with "FantasyPros
ranks him here" with "he scored this many points last year," something has
to join all three on *name*, since that's the only field they all have in
common.

Name-matching is never clean (nicknames, suffixes, punctuation, franchise
relocations), so this got its own normalization layer
(`pipeline/src/util/normalize.ts`):
- Lowercases, strips punctuation/apostrophes/periods, collapses hyphens to
  spaces, strips diacritics (é → e).
- Strips trailing suffixes (Jr./Sr./II/III/IV/V) so "Kenneth Walker III"
  matches "Kenneth Walker."
- Maps position labels across sources (Sleeper's `DEF` ↔ FantasyPros'
  `DST`).
- Maps team abbreviation drift (FantasyPros uses `JAC`, nflverse uses `LA`
  for the Rams, Sleeper uses `JAX`/`LAR`) — used only as a tie-breaker when
  two players share a normalized name.

Sleeper is the **anchor**: every one of the 992 Sleeper players gets a
crosswalk row, with `fantasyProsId` and `gsisId` filled in wherever a
confident match landed.

**Results:** 839/942 FantasyPros entries matched, 451/930 nflverse players
matched, **428 players have all three IDs**. Unmatched entries get written
to `crosswalk-unmatched.json` instead of silently dropped, so they're
reviewable rather than invisible.

**Known limitation:** most unmatched nflverse entries are legitimately
retired players (Tom Brady, Julio Jones, Matt Ryan — no longer Sleeper-
rostered, correctly excluded). But a real gap exists for **nicknames**:
FantasyPros lists "Hollywood Brown," Sleeper lists "Marquise Brown" — same
active player, missed because the names just don't match after
normalization. A name-based join can't fully close that gap. The
community-maintained `dynastyprocess/data` ID crosswalk (which maps Sleeper
IDs directly to FantasyPros/gsis IDs, no name-matching needed) would fix
this if it becomes a real problem — noted as a future upgrade, not built.

## Running it all

```bash
cd pipeline
npm install
npm run fetch:sleeper     # -> data/processed/players.json
npm run fetch:rankings    # -> data/processed/rankings-{std,half-ppr,ppr}.json
npm run fetch:stats       # -> data/processed/stats-by-season.json
npm run build:crosswalk   # -> data/processed/player-crosswalk.json
```

Order matters for the last step — the crosswalk reads the output of the
first three.

## What's next

1. **VBD ranking calculation** — the actual point of this project: use the
   crosswalked data to compute replacement-level baselines per position and
   rank every player by value over that baseline, per scoring format.
2. **GitHub Action** — wire these four scripts into a scheduled workflow so
   the data refreshes automatically instead of needing a manual run.
3. **Angular frontend** — reads the static JSON, renders rankings, and
   handles live draft state (mark a player drafted, everyone's value
   re-ranks).
4. **Deploy to Vercel/Netlify.**
