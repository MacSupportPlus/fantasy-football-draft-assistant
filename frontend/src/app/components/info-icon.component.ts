import { Component, ElementRef, Input, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { getMetric } from '../metrics-glossary';

const TOOLTIP_WIDTH = 220;
const MARGIN = 8;

@Component({
  selector: 'app-info-icon',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span
      #icon
      class="info-icon"
      tabindex="0"
      role="button"
      [attr.aria-label]="'What is ' + (def()?.label ?? metricKey) + '?'"
      (pointerenter)="show()"
      (pointerleave)="hide()"
      (focus)="show()"
      (blur)="hide()"
    >
      i
    </span>
    @if (open() && def(); as d) {
      <span
        class="info-tooltip"
        role="tooltip"
        [style.top.px]="tooltipTop()"
        [style.left.px]="tooltipLeft()"
      >{{ d.short }}</span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
    }

    .info-icon {
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
      flex-shrink: 0;
    }

    .info-icon:hover,
    .info-icon:focus-visible {
      background: #6fe0a0;
      color: #0d1310;
      outline: none;
    }

    .info-tooltip {
      /* position: fixed + JS-computed coordinates, not absolute — an
         absolutely-positioned tooltip nested inside a scrolling table
         (overflow-x: auto also clips the Y axis per the CSS spec's
         "one axis non-visible forces the other to auto" rule) gets cut
         off or renders in the wrong place. Fixed positioning escapes
         every ancestor's overflow clipping entirely. */
      position: fixed;
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
      z-index: 500;
      text-transform: none;
      letter-spacing: normal;
      white-space: normal;
      text-align: left;
    }
  `,
})
export class InfoIconComponent {
  @Input({ required: true }) metricKey!: string;
  @ViewChild('icon') iconRef!: ElementRef<HTMLElement>;

  readonly open = signal(false);
  readonly tooltipTop = signal(0);
  readonly tooltipLeft = signal(0);

  def() {
    return getMetric(this.metricKey);
  }

  show(): void {
    const rect = this.iconRef.nativeElement.getBoundingClientRect();
    const centeredLeft = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
    const clampedLeft = Math.max(
      MARGIN,
      Math.min(centeredLeft, window.innerWidth - TOOLTIP_WIDTH - MARGIN)
    );

    // Prefer above the icon; flip below if there's not enough room
    // (e.g. the icon sits near the top of the viewport).
    const estimatedHeight = 70;
    const above = rect.top - estimatedHeight - 6;
    const top = above > MARGIN ? above : rect.bottom + 6;

    this.tooltipTop.set(top);
    this.tooltipLeft.set(clampedLeft);
    this.open.set(true);
  }

  hide(): void {
    this.open.set(false);
  }
}
