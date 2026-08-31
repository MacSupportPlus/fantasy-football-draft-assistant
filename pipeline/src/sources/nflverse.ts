const PLAYER_STATS_URL =
  "https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats.csv";
const GAMES_URL =
  "https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv";

async function fetchCsv(url: string, label: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${label} request failed: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

// nflverse redirects release-asset downloads through
// release-assets.githubusercontent.com; fetch follows redirects by default.
export async function fetchPlayerStatsCsv(): Promise<string> {
  return fetchCsv(PLAYER_STATS_URL, "nflverse player_stats");
}

// Team-level stats are published one file per season (no combined file
// like player_stats has).
export async function fetchTeamStatsCsv(season: number): Promise<string> {
  const url = `https://github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_reg_${season}.csv`;
  return fetchCsv(url, `nflverse stats_team (${season})`);
}

// Every game, every season, in one file — includes final scores, which is
// what points-allowed (needed for D/ST scoring) is derived from.
export async function fetchGamesCsv(): Promise<string> {
  return fetchCsv(GAMES_URL, "nflverse games");
}
