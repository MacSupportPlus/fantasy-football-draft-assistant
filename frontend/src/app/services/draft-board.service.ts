import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { LiveVbdEntry, ScoringFormat, VbdEntry } from '../models/vbd-entry.model';
import { DEFAULT_LEAGUE_SETTINGS, LeagueSettings, replacementRank } from '../league-settings';

const STORAGE_KEY = 'ff-draft-assistant:drafted-ids';
const LEAGUE_STORAGE_KEY = 'ff-draft-assistant:league-settings';

const RANKINGS_FILES: Record<ScoringFormat, string> = {
  STD: 'data/vbd-rankings-std.json',
  HALF_PPR: 'data/vbd-rankings-half-ppr.json',
  PPR: 'data/vbd-rankings-ppr.json',
};

@Injectable({ providedIn: 'root' })
export class DraftBoardService {
  private readonly cache = new Map<ScoringFormat, VbdEntry[]>();

  readonly scoring = signal<ScoringFormat>('PPR');
  readonly entries = signal<VbdEntry[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly draftedIds = signal<Set<string>>(this.loadDraftedIds());
  // Team count (and, if ever needed, starters/flex share) is adjustable at
  // runtime — different leagues need different replacement-level math, and
  // this recomputes live with no pipeline rebuild required.
  readonly leagueSettings = signal<LeagueSettings>(this.loadLeagueSettings());

  // Recomputed every time the drafted set, loaded format, or league settings
  // change: replacement value at each position is the projected points of
  // the player at the replacement rank among whoever's still on the board —
  // so as a position thins out, its remaining players' VBD shifts live.
  readonly liveEntries = computed<LiveVbdEntry[]>(() =>
    this.computeLive(this.entries(), this.draftedIds(), this.leagueSettings())
  );

  constructor(private readonly http: HttpClient) {
    void this.setScoring('PPR');
  }

  async setScoring(format: ScoringFormat): Promise<void> {
    this.scoring.set(format);
    const cached = this.cache.get(format);
    if (cached) {
      this.entries.set(cached);
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    try {
      const data = await firstValueFrom(
        this.http.get<VbdEntry[]>(RANKINGS_FILES[format])
      );
      this.cache.set(format, data);
      this.entries.set(data);
    } catch (err) {
      this.error.set('Could not load rankings data.');
      console.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  toggleDrafted(sleeperId: string): void {
    const next = new Set(this.draftedIds());
    if (next.has(sleeperId)) {
      next.delete(sleeperId);
    } else {
      next.add(sleeperId);
    }
    this.draftedIds.set(next);
    this.saveDraftedIds(next);
  }

  resetDraft(): void {
    this.draftedIds.set(new Set());
    this.saveDraftedIds(new Set());
  }

  setTeams(teams: number): void {
    const next = { ...this.leagueSettings(), teams };
    this.leagueSettings.set(next);
    this.saveLeagueSettings(next);
  }

  private computeLive(
    entries: VbdEntry[],
    drafted: Set<string>,
    league: LeagueSettings
  ): LiveVbdEntry[] {
    const available = entries.filter((e) => !drafted.has(e.sleeperId));

    const byPosition = new Map<string, VbdEntry[]>();
    for (const e of available) {
      const list = byPosition.get(e.position) ?? [];
      list.push(e);
      byPosition.set(e.position, list);
    }

    const replacementValues = new Map<string, number>();
    for (const [position, list] of byPosition) {
      const sorted = [...list].sort((a, b) => b.projectedPoints - a.projectedPoints);
      const rank = replacementRank(position, league);
      const idx = Math.min(rank, sorted.length) - 1;
      replacementValues.set(position, sorted[Math.max(idx, 0)]?.projectedPoints ?? 0);
    }

    const live: LiveVbdEntry[] = entries.map((e) => {
      const isDrafted = drafted.has(e.sleeperId);
      const replacementValue = replacementValues.get(e.position) ?? e.replacementValue;
      return {
        ...e,
        drafted: isDrafted,
        liveReplacementValue: Math.round(replacementValue * 10) / 10,
        liveVbdScore: isDrafted
          ? e.vbdScore
          : Math.round((e.projectedPoints - replacementValue) * 10) / 10,
        livePositionRank: 0,
        liveOverallRank: 0,
      };
    });

    // Available players first (by live VBD), drafted players parked at the
    // end (by their original VBD) so the top of the board is always "best
    // player still on the board," with drafted players still viewable below.
    const stillAvailable = live
      .filter((e) => !e.drafted)
      .sort((a, b) => b.liveVbdScore - a.liveVbdScore);
    const draftedList = live
      .filter((e) => e.drafted)
      .sort((a, b) => b.vbdScore - a.vbdScore);

    stillAvailable.forEach((e, i) => (e.liveOverallRank = i + 1));
    const positionCounts = new Map<string, number>();
    for (const e of stillAvailable) {
      const next = (positionCounts.get(e.position) ?? 0) + 1;
      positionCounts.set(e.position, next);
      e.livePositionRank = next;
    }

    return [...stillAvailable, ...draftedList];
  }

  private loadLeagueSettings(): LeagueSettings {
    try {
      const raw = localStorage.getItem(LEAGUE_STORAGE_KEY);
      return raw ? { ...DEFAULT_LEAGUE_SETTINGS, ...JSON.parse(raw) } : DEFAULT_LEAGUE_SETTINGS;
    } catch {
      return DEFAULT_LEAGUE_SETTINGS;
    }
  }

  private saveLeagueSettings(settings: LeagueSettings): void {
    try {
      localStorage.setItem(LEAGUE_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // localStorage unavailable — setting just won't persist across a refresh.
    }
  }

  private loadDraftedIds(): Set<string> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  }

  private saveDraftedIds(ids: Set<string>): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
    } catch {
      // localStorage unavailable (private browsing, etc.) — draft state
      // just won't survive a refresh, which is an acceptable degradation.
    }
  }
}
