import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  ConsensusRanking,
  CrosswalkEntry,
  DefenseSeasonStats,
  KickerSeasonStats,
  SeasonStats,
} from '../models/player-detail.model';
import { LiveVbdEntry, ScoringFormat } from '../models/vbd-entry.model';
import { MAX_GAMES, RECENCY_WEIGHTS } from '../projection-weights';

export interface SeasonBreakdownRow {
  season: number;
  gamesPlayed: number;
  statLine: string;
  fantasyPoints: number;
  fantasyPointsPerGame: number;
  weight: number;
}

export interface PlayerDetail {
  entry: LiveVbdEntry;
  fpRanking: ConsensusRanking | null;
  seasons: SeasonBreakdownRow[];
  explanation: string;
}

const RANKINGS_FILES: Record<ScoringFormat, string> = {
  STD: 'data/rankings-std.json',
  HALF_PPR: 'data/rankings-half-ppr.json',
  PPR: 'data/rankings-ppr.json',
};

function offenseStatLine(s: SeasonStats, position: string): string {
  switch (position) {
    case 'QB': {
      const pass = `${s.passingYards} pass yds, ${s.passingTds} pass TD, ${s.interceptions} INT`;
      return s.carries > 0 ? `${pass}, ${s.carries} car, ${s.rushingYards} rush yds` : pass;
    }
    case 'RB':
      return `${s.carries} car, ${s.rushingYards} rush yds, ${s.rushingTds} rush TD, ${s.receptions} rec, ${s.receivingYards} rec yds`;
    default: // WR / TE
      return `${s.receptions} rec (${s.targets} tgt), ${s.receivingYards} rec yds, ${s.receivingTds} TD`;
  }
}

function defenseStatLine(s: DefenseSeasonStats): string {
  const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  return `${s.sacks} sacks, ${s.interceptions} INT, ${s.fumbleRecoveries} FR, ${s.defensiveTds} TD, pts-allowed ${sign(s.pointsAllowedScore)}, yds-allowed ${sign(s.yardsAllowedScore)}`;
}

function kickerStatLine(s: KickerSeasonStats): string {
  return `${s.fgMade}/${s.fgMade + s.fgMissed} FG, ${s.patMade} PAT`;
}

function offensePpg(s: SeasonStats, scoring: ScoringFormat): number {
  switch (scoring) {
    case 'STD':
      return s.fantasyPointsStdPerGame;
    case 'HALF_PPR':
      return s.fantasyPointsHalfPprPerGame;
    case 'PPR':
      return s.fantasyPointsPprPerGame;
  }
}

function offenseTotal(s: SeasonStats, scoring: ScoringFormat): number {
  switch (scoring) {
    case 'STD':
      return s.fantasyPointsStd;
    case 'HALF_PPR':
      return s.fantasyPointsHalfPpr;
    case 'PPR':
      return s.fantasyPointsPpr;
  }
}

@Injectable({ providedIn: 'root' })
export class PlayerDetailService {
  private crosswalk?: Promise<CrosswalkEntry[]>;
  private offenseSeasons?: Promise<SeasonStats[]>;
  private defenseSeasons?: Promise<DefenseSeasonStats[]>;
  private kickerSeasons?: Promise<KickerSeasonStats[]>;
  private readonly rankingsCache = new Map<ScoringFormat, Promise<ConsensusRanking[]>>();

  constructor(private readonly http: HttpClient) {}

  private loadCrosswalk(): Promise<CrosswalkEntry[]> {
    this.crosswalk ??= firstValueFrom(
      this.http.get<CrosswalkEntry[]>('data/player-crosswalk.json')
    );
    return this.crosswalk;
  }

  private loadOffenseSeasons(): Promise<SeasonStats[]> {
    this.offenseSeasons ??= firstValueFrom(
      this.http.get<SeasonStats[]>('data/stats-by-season.json')
    );
    return this.offenseSeasons;
  }

  private loadDefenseSeasons(): Promise<DefenseSeasonStats[]> {
    this.defenseSeasons ??= firstValueFrom(
      this.http.get<DefenseSeasonStats[]>('data/defense-stats-by-season.json')
    );
    return this.defenseSeasons;
  }

  private loadKickerSeasons(): Promise<KickerSeasonStats[]> {
    this.kickerSeasons ??= firstValueFrom(
      this.http.get<KickerSeasonStats[]>('data/kicker-stats-by-season.json')
    );
    return this.kickerSeasons;
  }

  private loadRankings(scoring: ScoringFormat): Promise<ConsensusRanking[]> {
    let cached = this.rankingsCache.get(scoring);
    if (!cached) {
      cached = firstValueFrom(this.http.get<ConsensusRanking[]>(RANKINGS_FILES[scoring]));
      this.rankingsCache.set(scoring, cached);
    }
    return cached;
  }

  async getDetail(entry: LiveVbdEntry, scoring: ScoringFormat): Promise<PlayerDetail> {
    const crosswalk = await this.loadCrosswalk();
    const cw = crosswalk.find((c) => c.sleeperId === entry.sleeperId) ?? null;

    const rankings = await this.loadRankings(scoring);
    const fpRanking = cw?.fantasyProsId
      ? rankings.find((r) => r.fantasyProsId === cw.fantasyProsId) ?? null
      : null;

    let seasons: SeasonBreakdownRow[] = [];

    if (entry.position === 'DST') {
      const all = await this.loadDefenseSeasons();
      const recent = all
        .filter((s) => s.team === entry.team)
        .sort((a, b) => b.season - a.season)
        .slice(0, 3);
      const weights = RECENCY_WEIGHTS[recent.length] ?? [];
      seasons = recent.map((s, i) => ({
        season: s.season,
        gamesPlayed: s.gamesPlayed,
        statLine: defenseStatLine(s),
        fantasyPoints: Math.round(s.fantasyPoints * 10) / 10,
        fantasyPointsPerGame: Math.round(s.fantasyPointsPerGame * 10) / 10,
        weight: weights[i] ?? 0,
      }));
    } else if (entry.position === 'K') {
      const all = await this.loadKickerSeasons();
      const recent = all
        .filter((s) => s.team === entry.team)
        .sort((a, b) => b.season - a.season)
        .slice(0, 3);
      const weights = RECENCY_WEIGHTS[recent.length] ?? [];
      seasons = recent.map((s, i) => ({
        season: s.season,
        gamesPlayed: s.gamesPlayed,
        statLine: kickerStatLine(s),
        fantasyPoints: Math.round(s.fantasyPoints * 10) / 10,
        fantasyPointsPerGame: Math.round(s.fantasyPointsPerGame * 10) / 10,
        weight: weights[i] ?? 0,
      }));
    } else if (cw?.gsisId) {
      const all = await this.loadOffenseSeasons();
      const recent = all
        .filter((s) => s.gsisId === cw.gsisId)
        .sort((a, b) => b.season - a.season)
        .slice(0, 3);
      const weights = RECENCY_WEIGHTS[recent.length] ?? [];
      seasons = recent.map((s, i) => ({
        season: s.season,
        gamesPlayed: s.gamesPlayed,
        statLine: offenseStatLine(s, entry.position),
        fantasyPoints: Math.round(offenseTotal(s, scoring) * 10) / 10,
        fantasyPointsPerGame: Math.round(offensePpg(s, scoring) * 10) / 10,
        weight: weights[i] ?? 0,
      }));
    }

    return {
      entry,
      fpRanking,
      seasons,
      explanation: this.buildExplanation(entry, seasons, fpRanking),
    };
  }

  private buildExplanation(
    entry: LiveVbdEntry,
    seasons: SeasonBreakdownRow[],
    fpRanking: ConsensusRanking | null
  ): string {
    if (entry.source === 'interpolated') {
      const rankText = fpRanking
        ? `FantasyPros' consensus rank of ${fpRanking.positionRank} (tier ${fpRanking.tier})`
        : 'a consensus rank';
      return `No usable NFL history for this player (rookie, or too few career snaps) — projectedPoints is interpolated from ${rankText}, matched against comparable historically-anchored players at the same position.`;
    }

    if (seasons.length === 0) {
      return 'No projection detail available for this player.';
    }

    const weightPct = seasons.map((s) => `${Math.round(s.weight * 100)}% ${s.season}`).join(', ');
    const weightedPerGame = seasons.reduce((sum, s) => sum + s.weight * s.fantasyPointsPerGame, 0);
    const weightedGames = Math.min(
      seasons.reduce((sum, s) => sum + s.weight * s.gamesPlayed, 0),
      MAX_GAMES
    );

    const kind =
      entry.position === 'DST'
        ? 'this defense'
        : entry.position === 'K'
        ? "this team's kicking output (proxy for whoever kicks there)"
        : 'this player';

    return (
      `Projected from a recency-weighted average of ${kind}'s last ${seasons.length} season(s) ` +
      `(weighted ${weightPct}), giving ${weightedPerGame.toFixed(1)} pts/game, scaled by a similarly ` +
      `weighted games-played estimate of ${weightedGames.toFixed(1)} games ` +
      `(missed time in recent seasons lowers this automatically) — ` +
      `${weightedPerGame.toFixed(1)} × ${weightedGames.toFixed(1)} ≈ ${entry.projectedPoints} projected points.`
    );
  }
}
