import type { SleeperPlayerMap } from "../types/player.js";

const SLEEPER_PLAYERS_URL = "https://api.sleeper.app/v1/players/nfl";

// Sleeper has no rate limit docs, but this endpoint returns the whole player
// dictionary (~5-6MB) in one shot — call it sparingly (Sleeper suggests at
// most once per day), not per-request.
export async function fetchSleeperPlayers(): Promise<SleeperPlayerMap> {
  const res = await fetch(SLEEPER_PLAYERS_URL);
  if (!res.ok) {
    throw new Error(
      `Sleeper players request failed: ${res.status} ${res.statusText}`
    );
  }
  return (await res.json()) as SleeperPlayerMap;
}
