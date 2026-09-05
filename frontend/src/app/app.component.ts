import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DraftBoardService } from './services/draft-board.service';
import { PlayerDetail, PlayerDetailService } from './services/player-detail.service';
import { LiveVbdEntry, ScoringFormat } from './models/vbd-entry.model';
import { PlayerCardComponent } from './components/player-card.component';
import { ValueChartComponent } from './components/value-chart.component';
import { InfoIconComponent } from './components/info-icon.component';
import { GlossaryComponent } from './components/glossary.component';
import { DraftNightComponent } from './components/draft-night.component';
import { DraftCenterComponent } from './components/draft-center.component';

type ViewMode = 'draft-center' | 'table' | 'draft-night';
type SortColumn =
  | 'overallRank'
  | 'name'
  | 'position'
  | 'positionRank'
  | 'team'
  | 'projectedPoints'
  | 'vbdScore'
  | 'fpPositionRank'
  | 'delta'
  | 'survivalPct';
type SortDirection = 'asc' | 'desc';

// Text columns read naturally A-Z first; every numeric/ranked column reads
// naturally highest-value-first (rank 1 is "highest," so rank columns sort
// ascending by default even though they're numeric).
const ASCENDING_BY_DEFAULT: ReadonlySet<SortColumn> = new Set([
  'name',
  'position',
  'team',
  'overallRank',
  'positionRank',
  'fpPositionRank',
]);

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'DST', 'K'] as const;
const SCORING_OPTIONS: [ScoringFormat, string][] = [
  ['STD', 'Standard'],
  ['HALF_PPR', 'Half PPR'],
  ['PPR', 'PPR'],
];
const TEAM_OPTIONS = [8, 10, 12, 14, 16];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PlayerCardComponent,
    ValueChartComponent,
    InfoIconComponent,
    GlossaryComponent,
    DraftNightComponent,
    DraftCenterComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  readonly positions = POSITIONS;
  readonly scoringOptions = SCORING_OPTIONS;
  readonly teamOptions = TEAM_OPTIONS;
  readonly positionFilter = signal<(typeof POSITIONS)[number]>('ALL');
  readonly search = signal('');
  readonly hideDrafted = signal(false);
  readonly selectedDetail = signal<PlayerDetail | null>(null);
  readonly showCharts = signal(true);
  readonly showGlossary = signal(false);
  readonly viewMode = signal<ViewMode>('draft-center');
  readonly sortColumn = signal<SortColumn | null>(null);
  readonly sortDirection = signal<SortDirection>('desc');

  readonly filtered = computed(() => {
    const pos = this.positionFilter();
    const term = this.search().trim().toLowerCase();
    const hide = this.hideDrafted();
    const column = this.sortColumn();
    const direction = this.sortDirection();

    const rows = this.board.liveEntries().filter((e) => {
      if (pos !== 'ALL' && e.position !== pos) return false;
      if (term && !e.name.toLowerCase().includes(term)) return false;
      if (hide && e.drafted) return false;
      return true;
    });

    if (column === null) return rows;

    const sign = direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = this.sortValue(a, column);
      const bv = this.sortValue(b, column);
      if (typeof av === 'string' || typeof bv === 'string') {
        return sign * String(av).localeCompare(String(bv));
      }
      return sign * (av - bv);
    });
  });

  readonly draftedCount = computed(() => this.board.draftedIds().size);

  constructor(
    public readonly board: DraftBoardService,
    private readonly playerDetail: PlayerDetailService
  ) {}

  setScoring(format: ScoringFormat): void {
    void this.board.setScoring(format);
  }

  setPositionFilter(pos: (typeof POSITIONS)[number]): void {
    this.positionFilter.set(pos);
  }

  // Clicking the same column again flips direction; clicking a new column
  // starts at that column's natural default direction.
  setSort(column: SortColumn): void {
    if (this.sortColumn() === column) {
      this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set(ASCENDING_BY_DEFAULT.has(column) ? 'asc' : 'desc');
    }
  }

  private sortValue(e: LiveVbdEntry, column: SortColumn): number | string {
    switch (column) {
      case 'overallRank':
        return e.drafted ? Number.POSITIVE_INFINITY : e.liveOverallRank;
      case 'name':
        return e.name.toLowerCase();
      case 'position':
        return e.position;
      case 'positionRank':
        return e.drafted ? Number.POSITIVE_INFINITY : e.livePositionRank;
      case 'team':
        return e.team ?? '';
      case 'projectedPoints':
        return e.projectedPoints;
      case 'vbdScore':
        return e.liveVbdScore;
      case 'fpPositionRank':
        return this.fpPositionRankNum(e) ?? Number.POSITIVE_INFINITY;
      case 'delta':
        return this.rankDelta(e) ?? Number.NEGATIVE_INFINITY;
      case 'survivalPct':
        return e.survivalPct ?? -1;
    }
  }

  onNeedPillClick(position: string): void {
    if ((POSITIONS as readonly string[]).includes(position)) {
      this.setPositionFilter(position as (typeof POSITIONS)[number]);
    }
  }

  onDraftSlotInput(value: string): void {
    const n = Number(value);
    this.board.setDraftSlot(value.trim() === '' || !Number.isFinite(n) || n < 1 ? null : n);
  }

  onSearchInput(value: string): void {
    this.search.set(value);
  }

  toggleDraft(sleeperId: string): void {
    this.board.toggleDrafted(sleeperId);
  }

  resetDraft(): void {
    if (confirm('Clear all drafted players and start over?')) {
      this.board.resetDraft();
    }
  }

  // FantasyPros' positionRank is a string like "RB14" — pull the number out
  // so it can be compared directly against our own position rank.
  fpPositionRankNum(entry: LiveVbdEntry): number | null {
    if (!entry.fpPositionRank) return null;
    const match = entry.fpPositionRank.match(/(\d+)$/);
    return match ? Number(match[1]) : null;
  }

  // Positive = we rate this player better than FantasyPros' consensus does
  // (their rank number is bigger than ours); negative = we rate them worse.
  rankDelta(entry: LiveVbdEntry): number | null {
    const fpRank = this.fpPositionRankNum(entry);
    if (fpRank === null) return null;
    return fpRank - entry.livePositionRank;
  }

  async openPlayer(entry: LiveVbdEntry): Promise<void> {
    const detail = await this.playerDetail.getDetail(entry, this.board.scoring());
    this.selectedDetail.set(detail);
  }

  closePlayer(): void {
    this.selectedDetail.set(null);
  }
}
