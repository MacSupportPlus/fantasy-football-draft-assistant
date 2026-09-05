import { Component, EventEmitter, Output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DraftBoardService } from '../services/draft-board.service';
import { LiveVbdEntry } from '../models/vbd-entry.model';
import { slotForPick } from '../vona';

const TOP_PICKS_SIZE = 5;

interface DraftedRow {
  pickNumber: number;
  entry: LiveVbdEntry;
  isMine: boolean;
}

@Component({
  selector: 'app-draft-center',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './draft-center.component.html',
  styleUrl: './draft-center.component.css',
})
export class DraftCenterComponent {
  @Output() playerSelected = new EventEmitter<LiveVbdEntry>();

  constructor(public readonly board: DraftBoardService) {}

  private readonly unsatisfiedPositions = computed(
    () => new Set(this.board.positionalNeeds().filter((n) => !n.satisfied).map((n) => n.position))
  );

  readonly topPicks = computed(() =>
    this.board
      .liveEntries()
      .filter((e) => !e.drafted)
      .slice(0, TOP_PICKS_SIZE)
      .map((e) => ({ entry: e, fillsNeed: this.unsatisfiedPositions().has(e.position) }))
  );

  // Most recent pick first - a live draft log, not a static list.
  readonly draftedRows = computed<DraftedRow[]>(() => {
    const order = this.board.draftOrder();
    const slot = this.board.draftSlot();
    const teams = this.board.leagueSettings().teams;
    const byId = new Map(this.board.liveEntries().map((e) => [e.sleeperId, e]));

    const rows: DraftedRow[] = [];
    order.forEach((id, i) => {
      const entry = byId.get(id);
      if (!entry) return;
      const pickNumber = i + 1;
      rows.push({
        pickNumber,
        entry,
        isMine: slot !== null && slotForPick(pickNumber, teams) === slot,
      });
    });
    return rows.reverse();
  });

  draft(entry: LiveVbdEntry): void {
    this.board.toggleDrafted(entry.sleeperId);
  }

  selectPlayer(entry: LiveVbdEntry): void {
    this.playerSelected.emit(entry);
  }
}
