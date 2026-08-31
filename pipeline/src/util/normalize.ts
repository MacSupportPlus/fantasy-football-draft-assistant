// Sleeper, FantasyPros, and nflverse each use their own player IDs and don't
// share a key. Joining them means matching on normalized name + position,
// with team as a tie-breaker — so all the "why didn't this match" edge cases
// (suffixes, punctuation, team abbreviation drift) live here.

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);
const DIACRITICS = /[̀-ͯ]/g;

export function normalizeName(raw: string): string {
  let name = raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(DIACRITICS, "") // strip diacritics (e.g. e-acute -> e)
    .replace(/['".]/g, "") // drop apostrophes/periods: "Ja'Marr" -> "jamarr"
    .replace(/-/g, " ") // hyphens -> space: "Amon-Ra" -> "amon ra"
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const words = name.split(" ");
  if (words.length > 1 && SUFFIXES.has(words[words.length - 1])) {
    words.pop();
  }
  return words.join(" ");
}

// Sleeper uses "DEF" for team defenses; FantasyPros uses "DST".
const POSITION_ALIASES: Record<string, string> = {
  DEF: "DST",
};

export function normalizePosition(pos: string): string {
  return POSITION_ALIASES[pos] ?? pos;
}

// Known abbreviation drift between sources (not franchise relocations —
// those are already reflected consistently within our data windows).
const TEAM_ALIASES: Record<string, string> = {
  JAC: "JAX", // FantasyPros uses JAC for Jacksonville
  LA: "LAR", // nflverse uses LA for the Rams
};

export function normalizeTeam(team: string | null): string | null {
  if (!team) return null;
  return TEAM_ALIASES[team] ?? team;
}
