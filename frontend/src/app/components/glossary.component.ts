import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { METRICS } from '../metrics-glossary';

// Grouped for readability on the glossary page — order here, not object
// insertion order, controls what the reader sees first.
const SECTIONS: { title: string; keys: string[] }[] = [
  {
    title: 'Draft board columns',
    keys: ['overallRank', 'positionRank', 'position', 'team', 'projectedPoints', 'vbdScore', 'fpPositionRank', 'rankDelta', 'source'],
  },
  {
    title: 'Player card',
    keys: ['replacementValue', 'ecr', 'tier', 'rankSpread', 'rosteredPct', 'byeWeek', 'seasonWeight'],
  },
];

@Component({
  selector: 'app-glossary',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './glossary.component.html',
  styleUrl: './glossary.component.css',
})
export class GlossaryComponent {
  @Output() closed = new EventEmitter<void>();
  readonly sections = SECTIONS.map((s) => ({
    title: s.title,
    items: s.keys.map((k) => METRICS[k]).filter(Boolean),
  }));

  close(): void {
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }
}
