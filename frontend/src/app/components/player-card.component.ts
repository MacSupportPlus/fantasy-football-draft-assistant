import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PlayerDetail } from '../services/player-detail.service';
import { InfoIconComponent } from './info-icon.component';

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

  close(): void {
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }
}
