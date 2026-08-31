import type {
  ConsensusRanking,
  FantasyProsEcrData,
  ScoringFormat,
} from "../types/ranking.js";

// FantasyPros has no public rankings API. These "cheatsheet" pages are
// server-rendered and embed the full ranking set as a `var ecrData = {...}`
// blob in an inline <script> — same data the page's own table renders from,
// just without needing JS execution. If FantasyPros redesigns these pages,
// this regex is the first thing to check.
const RANKINGS_URLS: Record<ScoringFormat, string> = {
  STD: "https://www.fantasypros.com/nfl/rankings/consensus-cheatsheets.php",
  HALF_PPR:
    "https://www.fantasypros.com/nfl/rankings/half-point-ppr-cheatsheets.php",
  PPR: "https://www.fantasypros.com/nfl/rankings/ppr-cheatsheets.php",
};

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

function extractEcrData(html: string): FantasyProsEcrData {
  const marker = "var ecrData = ";
  const start = html.indexOf(marker);
  if (start === -1) {
    throw new Error(
      "Could not find ecrData in FantasyPros page — page structure may have changed."
    );
  }
  const jsonStart = start + marker.length;
  const end = html.indexOf(";\n", jsonStart);
  if (end === -1) {
    throw new Error("Could not find end of ecrData blob.");
  }
  return JSON.parse(html.slice(jsonStart, end)) as FantasyProsEcrData;
}

export async function fetchConsensusRankings(
  scoring: ScoringFormat
): Promise<ConsensusRanking[]> {
  const res = await fetch(RANKINGS_URLS[scoring], {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(
      `FantasyPros rankings request failed: ${res.status} ${res.statusText}`
    );
  }

  const html = await res.text();
  const ecrData = extractEcrData(html);

  return ecrData.players.map((p) => ({
    fantasyProsId: p.player_id,
    name: p.player_name,
    team: p.player_team_id,
    position: p.player_position_id,
    positionRank: p.pos_rank,
    tier: p.tier,
    rankEcr: p.rank_ecr,
    rankAve: Number(p.rank_ave),
    rankMin: Number(p.rank_min),
    rankMax: Number(p.rank_max),
    rankStd: Number(p.rank_std),
    ownedPct: p.player_owned_avg,
    byeWeek: p.player_bye_week ? Number(p.player_bye_week) : null,
    scoring,
  }));
}
