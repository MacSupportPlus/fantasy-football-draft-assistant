import { Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PlayerDetail, SeasonBreakdownRow } from '../services/player-detail.service';
import { InfoIconComponent } from './info-icon.component';

type SeasonSortColumn = 'season' | 'gamesPlayed' | 'fantasyPointsPerGame' | 'weight';

@Component({
  selector: 'app-player-card',
  standalone: true,
  imports: [CommonModule, InfoIconComponent],
  templateUrl: './player-card.component.html',
  styleUrl: './player-card.component.css',
})
export class PlayerCardComponent {
  @Input({ required: true }) detail!: PlayerDetail;
  @Output() closed = new EventEmitter<void>();

  readonly seasonSortColumn = signal<SeasonSortColumn>('season');
  readonly seasonSortDirection = signal<'asc' | 'desc'>('desc');

  readonly sortedSeasons = computed<SeasonBreakdownRow[]>(() => {
    const column = this.seasonSortColumn();
    const sign = this.seasonSortDirection() === 'asc' ? 1 : -1;
    return [...this.detail.seasons].sort((a, b) => sign * (a[column] - b[column]));
  });

  setSeasonSort(column: SeasonSortColumn): void {
    if (this.seasonSortColumn() === column) {
      this.seasonSortDirection.set(this.seasonSortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.seasonSortColumn.set(column);
      this.seasonSortDirection.set('desc');
    }
  }

  close(): void {
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }
}
