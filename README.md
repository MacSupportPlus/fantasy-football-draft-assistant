# Fantasy Football Draft Assistant

A data-driven live draft tool built around **value-based drafting (VBD)** —
players are ranked by value over replacement at their position, not raw
projected points. Rankings update client-side as players are drafted.

## Constraints

- Free to build and host — no AWS, no paid services.
- No backend server. A scheduled GitHub Action runs the data pipeline and
  writes static JSON (and/or SQLite) into the repo. The frontend reads that
  data directly and does all VBD ranking + live draft-state logic client-side.
- Frontend: Angular, hosted on Vercel or Netlify's free tier.

## Repo structure

```
pipeline/           Node/TypeScript data pipeline (run locally or via GitHub Action)
  src/
    sources/         One module per data source (Sleeper, FantasyPros, nflverse, ...)
    types/           Shared TypeScript types for player/data records
data/
  raw/               Unmodified API responses, for debugging/reprocessing
  processed/         Cleaned data the frontend actually consumes
.github/workflows/   Scheduled GitHub Action(s) that run the pipeline
frontend/            Angular app (not yet scaffolded)
```

## Data sources

- **Sleeper API** — player metadata (names, positions, teams, status).
- **FantasyPros** — consensus rankings / ADP.
- **nflverse / nflfastR** — historical stats for projections.

## Pipeline

```bash
cd pipeline
npm install
npm run fetch:sleeper    # player metadata
npm run fetch:rankings   # FantasyPros consensus rankings (STD/HALF_PPR/PPR)
```

`fetch:sleeper` writes the raw Sleeper response to
`data/raw/sleeper-players.json` and a filtered, fantasy-relevant subset to
`data/processed/players.json`.

`fetch:rankings` writes one file per scoring format to
`data/processed/rankings-{std,half-ppr,ppr}.json`. FantasyPros has no public
rankings API — these are scraped from the `ecrData` blob that their
"cheatsheet" rankings pages embed server-side (see
`pipeline/src/sources/fantasypros.ts`). If FantasyPros changes that page's
markup, this is the first thing to check.

`fetch:stats` downloads nflverse's weekly `player_stats.csv` (all seasons,
~30MB), aggregates to per-player-season totals for the last 3 regular
seasons, and writes `data/processed/stats-by-season.json`. Includes both
standard and PPR fantasy points (half-PPR is derived as their average) plus
core volume stats (targets, carries, receptions, etc). Note: as of this
writing nflverse's file tops out at the 2024 season — it may lag the most
recently completed season.

`build:crosswalk` joins the three sources on normalized name + position
(team as a tie-breaker when a name collides), since none of them share an
ID. Sleeper is the anchor — every Sleeper player gets a crosswalk row, with
`fantasyProsId`/`gsisId` filled in where a confident match was found. Writes
`data/processed/player-crosswalk.json` (992 rows) and
`data/processed/crosswalk-unmatched.json` (entries from the other two
sources that didn't match anything, for review).

Current match rates: 839/942 FantasyPros entries, 451/930 nflverse players.
Most unmatched nflverse entries are players who retired sometime in the last
3 seasons and are no longer Sleeper-rostered (expected). The known gap is
nicknames FantasyPros uses that Sleeper doesn't — e.g. FantasyPros lists
"Hollywood Brown", Sleeper lists "Marquise Brown" — so a handful of active
players slip through. A name-based join can't fully close that; the
community-maintained `dynastyprocess/data` ID crosswalk (which maps Sleeper
IDs directly to FantasyPros/gsis IDs) would be the next step up if better
coverage is needed later.
