import { Component, EventEmitter, Output, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DraftBoardService } from '../services/draft-board.service';
import { LiveVbdEntry } from '../models/vbd-entry.model';
import { slotForPick } from '../vona';
import { PlayerPickerComponent } from './player-picker.component';

const TOP_PICKS_SIZE = 5;

interface DraftedRow {
  pickNumber: number;
  entry: LiveVbdEntry;
  isMine: boolean;
}

@Component({
  selector: 'app-draft-center',
  standalone: true,
  imports: [CommonModule, PlayerPickerComponent],
  templateUrl: './draft-center.component.html',
  styleUrl: './draft-center.component.css',
})
export class DraftCenterComponent {
  @Output() playerSelected = new EventEmitter<LiveVbdEntry>();

  readonly showOpponentPicker = signal(false);

  constructor(public readonly board: DraftBoardService) {}

  // Only meaningful once a draft slot is set - without one we don't know
  // whose turn anything is, so there's nothing to gate.
  readonly turnGateActive = computed(() => this.board.draftSlot() !== null);
  readonly isMyTurn = computed(() => this.board.picksUntilMyTurn() === 0);

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

  // The "Draft" button on a recommended card is *your* pick - guarded by
  // isMyTurn in the template so it can't be used to log someone else's.
  draft(entry: LiveVbdEntry): void {
    this.board.toggleDrafted(entry.sleeperId);
  }

  // Logging another team's pick is a distinct, explicitly-labeled action -
  // never framed as "drafting" one of your own recommendations.
  logOpponentPick(entry: LiveVbdEntry): void {
    this.board.toggleDrafted(entry.sleeperId);
    this.showOpponentPicker.set(false);
  }

  selectPlayer(entry: LiveVbdEntry): void {
    this.playerSelected.emit(entry);
  }
}
