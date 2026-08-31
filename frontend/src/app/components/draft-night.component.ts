import { Component, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DraftBoardService } from '../services/draft-board.service';
import { LiveVbdEntry } from '../models/vbd-entry.model';

const BOARD_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'DST', 'K'] as const;
const COLUMN_SIZE = 15;
const HERO_SIZE = 5;

@Component({
  selector: 'app-draft-night',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './draft-night.component.html',
  styleUrl: './draft-night.component.css',
})
export class DraftNightComponent {
  readonly positions = BOARD_POSITIONS;

  constructor(public readonly board: DraftBoardService) {}

  readonly available = computed(() => this.board.liveEntries().filter((e) => !e.drafted));

  readonly hero = computed(() => this.available().slice(0, HERO_SIZE));

  readonly columns = computed(() => {
    const avail = this.available();
    return BOARD_POSITIONS.map((position) => ({
      position,
      players: avail.filter((e) => e.position === position).slice(0, COLUMN_SIZE),
    }));
  });

  readonly draftedList = computed(() =>
    this.board
      .liveEntries()
      .filter((e) => e.drafted)
      .sort((a, b) => b.vbdScore - a.vbdScore)
  );

  readonly pickNumber = computed(() => this.board.draftedIds().size + 1);

  draft(entry: LiveVbdEntry): void {
    this.board.toggleDrafted(entry.sleeperId);
  }
}
