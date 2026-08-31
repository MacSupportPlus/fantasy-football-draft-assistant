const PLAYER_STATS_URL =
  "https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats.csv";

// nflverse redirects release-asset downloads through
// release-assets.githubusercontent.com; fetch follows redirects by default.
export async function fetchPlayerStatsCsv(): Promise<string> {
  const res = await fetch(PLAYER_STATS_URL);
  if (!res.ok) {
    throw new Error(
      `nflverse player_stats request failed: ${res.status} ${res.statusText}`
    );
  }
  return res.text();
}
