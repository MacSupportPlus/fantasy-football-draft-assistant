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

type ViewMode = 'table' | 'draft-night';

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'DST', 'K'] as const;
const SCORING_OPTIONS: [ScoringFormat, string][] = [
  ['STD', 'Standard'],
  ['HALF_PPR', 'Half PPR'],
  ['PPR', 'PPR'],
];

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
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  readonly positions = POSITIONS;
  readonly scoringOptions = SCORING_OPTIONS;
  readonly positionFilter = signal<(typeof POSITIONS)[number]>('ALL');
  readonly search = signal('');
  readonly hideDrafted = signal(false);
  readonly selectedDetail = signal<PlayerDetail | null>(null);
  readonly showCharts = signal(true);
  readonly showGlossary = signal(false);
  readonly viewMode = signal<ViewMode>('table');

  readonly filtered = computed(() => {
    const pos = this.positionFilter();
    const term = this.search().trim().toLowerCase();
    const hide = this.hideDrafted();

    return this.board.liveEntries().filter((e) => {
      if (pos !== 'ALL' && e.position !== pos) return false;
      if (term && !e.name.toLowerCase().includes(term)) return false;
      if (hide && e.drafted) return false;
      return true;
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
