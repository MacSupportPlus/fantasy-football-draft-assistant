import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DraftBoardService } from './services/draft-board.service';
import { PlayerDetail, PlayerDetailService } from './services/player-detail.service';
import { LiveVbdEntry, ScoringFormat } from './models/vbd-entry.model';
import { PlayerCardComponent } from './components/player-card.component';

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'DST', 'K'] as const;
const SCORING_OPTIONS: [ScoringFormat, string][] = [
  ['STD', 'Standard'],
  ['HALF_PPR', 'Half PPR'],
  ['PPR', 'PPR'],
];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, PlayerCardComponent],
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

  async openPlayer(entry: LiveVbdEntry): Promise<void> {
    const detail = await this.playerDetail.getDetail(entry, this.board.scoring());
    this.selectedDetail.set(detail);
  }

  closePlayer(): void {
    this.selectedDetail.set(null);
  }
}
