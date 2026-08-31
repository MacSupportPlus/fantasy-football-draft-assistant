import { fetchGamesCsv } from "../sources/nflverse.js";
import { parseCsv } from "../util/csv.js";
import { normalizeTeam } from "../util/normalize.js";
import type { DefenseSeasonStats } from "../types/defense.js";

const MAX_ADJUSTMENT = 0.06; // bounded to a modest ±6% - this is a coarse signal, not a precise model
const DAMPENING = 0.5;

function num(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Coarse, whole-team strength-of-schedule adjustment for offensive players:
// looks at the team's upcoming season's opponents and how tough those
// defenses were most recently (using our own D/ST fantasy output as an
// "is this defense good" proxy — not a position-specific matchup model,
// e.g. it doesn't know a defense is bad against the pass but good against
// the run). Bounded to ±6% deliberately, since this is a first-pass signal,
// not a rigorous SOS model. Only applied to QB/RB/WR/TE.
export async function computeStrengthOfScheduleByTeam(
  defenseSeasonsByTeam: Map<string, DefenseSeasonStats[]>
): Promise<Map<string, number>> {
  const strengthByTeam = new Map<string, number>();
  for (const [team, seasons] of defenseSeasonsByTeam) {
    const latest = [...seasons].sort((a, b) => b.season - a.season)[0];
    if (latest) strengthByTeam.set(team, latest.fantasyPointsPerGame);
  }
  const leagueAvgStrength =
    [...strengthByTeam.values()].reduce((sum, v) => sum + v, 0) / strengthByTeam.size;

  const games = parseCsv(await fetchGamesCsv());
  const upcomingSeason = games.reduce((max, g) => Math.max(max, num(g.season)), 0);

  const opponentsByTeam = new Map<string, string[]>();
  for (const g of games) {
    if (g.game_type !== "REG") continue;
    if (num(g.season) !== upcomingSeason) continue;
    if (g.home_score !== "" || g.away_score !== "") continue; // only unplayed = the season being drafted for

    const home = normalizeTeam(g.home_team)!;
    const away = normalizeTeam(g.away_team)!;
    if (!opponentsByTeam.has(home)) opponentsByTeam.set(home, []);
    if (!opponentsByTeam.has(away)) opponentsByTeam.set(away, []);
    opponentsByTeam.get(home)!.push(away);
    opponentsByTeam.get(away)!.push(home);
  }

  const multiplierByTeam = new Map<string, number>();
  for (const [team, opponents] of opponentsByTeam) {
    const strengths = opponents
      .map((o) => strengthByTeam.get(o))
      .filter((v): v is number => v !== undefined);
    if (strengths.length === 0) continue;

    const avgOpponentStrength = strengths.reduce((sum, v) => sum + v, 0) / strengths.length;
    const diffPct = (avgOpponentStrength - leagueAvgStrength) / leagueAvgStrength;
    const adjustment = Math.max(-MAX_ADJUSTMENT, Math.min(MAX_ADJUSTMENT, -diffPct * DAMPENING));
    multiplierByTeam.set(team, 1 + adjustment);
  }

  return multiplierByTeam;
}
