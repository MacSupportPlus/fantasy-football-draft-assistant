import { Component, EventEmitter, Output, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DraftBoardService } from '../services/draft-board.service';
import { LiveVbdEntry } from '../models/vbd-entry.model';
import { pickNumberForRound } from '../vona';
import { PlayerPickerComponent } from './player-picker.component';

interface GridCell {
  pickNumber: number;
  index: number; // 0-based into draftOrder
  entry: LiveVbdEntry | null; // null = not picked yet
  isNext: boolean; // the actual next pick to happen
  isMine: boolean;
}

interface GridRow {
  round: number;
  cells: GridCell[];
}

type PickerMode = { index: number; kind: 'insert' | 'replace' } | null;
type ActionTarget = { index: number; entry: LiveVbdEntry } | null;

@Component({
  selector: 'app-draft-grid',
  standalone: true,
  imports: [CommonModule, PlayerPickerComponent],
  templateUrl: './draft-grid.component.html',
  styleUrl: './draft-grid.component.css',
})
export class DraftGridComponent {
  @Output() playerSelected = new EventEmitter<LiveVbdEntry>();

  readonly actionTarget = signal<ActionTarget>(null);
  readonly pickerMode = signal<PickerMode>(null);

  constructor(public readonly board: DraftBoardService) {}

  readonly slots = computed(() => {
    const teams = this.board.leagueSettings().teams;
    return Array.from({ length: teams }, (_, i) => i + 1);
  });

  readonly rows = computed<GridRow[]>(() => {
    const teams = this.board.leagueSettings().teams;
    const slot = this.board.draftSlot();
    const order = this.board.draftOrder();
    const picksMade = order.length;
    const byId = new Map(this.board.liveEntries().map((e) => [e.sleeperId, e]));

    // Show every completed round plus the round containing the next pick -
    // the grid grows with the draft instead of guessing a final roster size.
    const maxRound = Math.ceil((picksMade + 1) / teams);

    const rows: GridRow[] = [];
    for (let round = 1; round <= maxRound; round++) {
      const cells: GridCell[] = this.slots().map((col) => {
        const pickNumber = pickNumberForRound(round, col, teams);
        const index = pickNumber - 1;
        const id = order[index];
        return {
          pickNumber,
          index,
          entry: id ? byId.get(id) ?? null : null,
          isNext: pickNumber === picksMade + 1,
          isMine: slot !== null && col === slot,
        };
      });
      rows.push({ round, cells });
    }
    return rows;
  });

  cellClick(cell: GridCell): void {
    if (cell.entry) {
      this.actionTarget.set({ index: cell.index, entry: cell.entry });
    } else if (cell.isNext) {
      this.pickerMode.set({ index: cell.index, kind: 'insert' });
    }
    // Future cells beyond the next pick aren't clickable - nothing to do yet.
  }

  chooseReplace(): void {
    const target = this.actionTarget();
    if (!target) return;
    this.pickerMode.set({ index: target.index, kind: 'replace' });
    this.actionTarget.set(null);
  }

  chooseInsertBefore(): void {
    const target = this.actionTarget();
    if (!target) return;
    this.pickerMode.set({ index: target.index, kind: 'insert' });
    this.actionTarget.set(null);
  }

  chooseRemove(): void {
    const target = this.actionTarget();
    if (!target) return;
    this.board.removePickAt(target.index);
    this.actionTarget.set(null);
  }

  cancelAction(): void {
    this.actionTarget.set(null);
  }

  onPicked(entry: LiveVbdEntry): void {
    const mode = this.pickerMode();
    if (!mode) return;
    if (mode.kind === 'insert') {
      this.board.insertPickAt(mode.index, entry.sleeperId);
    } else {
      this.board.replacePickAt(mode.index, entry.sleeperId);
    }
    this.pickerMode.set(null);
  }

  cancelPicker(): void {
    this.pickerMode.set(null);
  }

  pickerTitle(): string {
    const mode = this.pickerMode();
    if (!mode) return '';
    return mode.kind === 'insert'
      ? `Who was pick #${mode.index + 1}?`
      : `Replace pick #${mode.index + 1} with...`;
  }

  selectPlayer(entry: LiveVbdEntry): void {
    this.playerSelected.emit(entry);
  }
}
