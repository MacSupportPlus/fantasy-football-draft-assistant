import { Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DraftBoardService } from '../services/draft-board.service';
import { LiveVbdEntry } from '../models/vbd-entry.model';

const MAX_RESULTS = 30;

@Component({
  selector: 'app-player-picker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './player-picker.component.html',
  styleUrl: './player-picker.component.css',
})
export class PlayerPickerComponent {
  // What this picker is doing - shown in the header so it's never ambiguous
  // whether picking a name will insert a new pick or overwrite one.
  @Input({ required: true }) title!: string;
  @Output() picked = new EventEmitter<LiveVbdEntry>();
  @Output() cancelled = new EventEmitter<void>();

  readonly search = signal('');

  readonly results = computed<LiveVbdEntry[]>(() => {
    const term = this.search().trim().toLowerCase();
    const available = this.board.liveEntries().filter((e) => !e.drafted);
    const matches = term ? available.filter((e) => e.name.toLowerCase().includes(term)) : available;
    return matches.slice(0, MAX_RESULTS);
  });

  constructor(public readonly board: DraftBoardService) {}

  onSearchInput(value: string): void {
    this.search.set(value);
  }

  select(entry: LiveVbdEntry): void {
    this.picked.emit(entry);
  }

  cancel(): void {
    this.cancelled.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.cancel();
  }
}
