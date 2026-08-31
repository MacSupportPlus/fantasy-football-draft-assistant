import { Component, Input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { getMetric } from '../metrics-glossary';

@Component({
  selector: 'app-info-icon',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span
      class="info-icon"
      tabindex="0"
      role="button"
      [attr.aria-label]="'What is ' + (def()?.label ?? metricKey) + '?'"
      (pointerenter)="open.set(true)"
      (pointerleave)="open.set(false)"
      (focus)="open.set(true)"
      (blur)="open.set(false)"
    >
      i
      @if (open() && def(); as d) {
        <span class="info-tooltip" role="tooltip">{{ d.short }}</span>
      }
    </span>
  `,
  styles: `
    .info-icon {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #262b34;
      color: #9aa2ad;
      font-size: 0.62rem;
      font-weight: 700;
      font-style: italic;
      font-family: Georgia, serif;
      cursor: help;
      margin-left: 4px;
      vertical-align: middle;
    }

    .info-icon:hover,
    .info-icon:focus-visible {
      background: #6fe0a0;
      color: #0d1310;
      outline: none;
    }

    .info-tooltip {
      position: absolute;
      bottom: calc(100% + 6px);
      left: 50%;
      transform: translateX(-50%);
      width: 220px;
      background: #1e232b;
      color: #dfe3e8;
      font-size: 0.74rem;
      font-weight: 400;
      font-style: normal;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.4;
      padding: 8px 10px;
      border-radius: 6px;
      border: 1px solid #2f3540;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      z-index: 50;
      text-transform: none;
      letter-spacing: normal;
      white-space: normal;
      text-align: left;
    }
  `,
})
export class InfoIconComponent {
  @Input({ required: true }) metricKey!: string;
  readonly open = signal(false);

  def() {
    return getMetric(this.metricKey);
  }
}
