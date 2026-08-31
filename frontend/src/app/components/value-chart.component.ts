import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DraftBoardService } from '../services/draft-board.service';
import { LiveVbdEntry } from '../models/vbd-entry.model';

// Validated categorical palette (dark-mode steps), assigned in a fixed
// order — see dataviz skill's references/palette.md. Not the sole identity
// channel: each facet also carries a text label (the position name), so
// color here is reinforcing, not load-bearing.
const POSITION_COLOR: Record<string, string> = {
  QB: '#3987e5', // blue
  RB: '#d95926', // orange
  WR: '#199e70', // aqua
  TE: '#c98500', // yellow
  DST: '#d55181', // magenta
  K: '#008300', // green
};
const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'DST', 'K'] as const;
const BARS_PER_CHART = 40; // wide enough that RB/WR (replacement ~rank 34-35) show the cliff, not just the plateau above it
const PLOT_HEIGHT = 120;
const BAR_WIDTH = 10;
const BAR_GAP = 2;

interface ChartBar {
  sleeperId: string;
  name: string;
  vbdScore: number;
  projectedPoints: number;
  drafted: boolean;
  x: number;
  barY: number; // top of the rect in SVG coords
  barHeight: number;
  positive: boolean;
}

interface PositionChart {
  position: string;
  color: string;
  bars: ChartBar[];
  zeroY: number;
  width: number;
}

@Component({
  selector: 'app-value-chart',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './value-chart.component.html',
  styleUrl: './value-chart.component.css',
})
export class ValueChartComponent {
  readonly hoveredBar = signal<{ chartPos: string; bar: ChartBar } | null>(null);

  constructor(public readonly board: DraftBoardService) {}

  readonly charts = computed<PositionChart[]>(() => {
    const entries = this.board.liveEntries();
    return POSITIONS.map((position) => this.buildChart(position, entries));
  });

  private buildChart(position: string, entries: LiveVbdEntry[]): PositionChart {
    const players = entries
      .filter((e) => e.position === position)
      .sort((a, b) => a.livePositionRank - b.livePositionRank)
      .slice(0, BARS_PER_CHART);

    const maxPositive = Math.max(0, ...players.map((p) => p.liveVbdScore));
    const maxNegative = Math.max(0, ...players.map((p) => -p.liveVbdScore));
    const total = maxPositive + maxNegative || 1;
    const posBudget = (PLOT_HEIGHT * maxPositive) / total;
    const negBudget = PLOT_HEIGHT - posBudget;
    const zeroY = posBudget;

    const bars: ChartBar[] = players.map((p, i) => {
      const positive = p.liveVbdScore >= 0;
      const magnitude = Math.abs(p.liveVbdScore);
      const scale = positive ? (maxPositive > 0 ? posBudget / maxPositive : 0) : maxNegative > 0 ? negBudget / maxNegative : 0;
      const barHeight = Math.max(1, magnitude * scale);
      return {
        sleeperId: p.sleeperId,
        name: p.name,
        vbdScore: p.liveVbdScore,
        projectedPoints: p.projectedPoints,
        drafted: p.drafted,
        x: i * (BAR_WIDTH + BAR_GAP),
        barY: positive ? zeroY - barHeight : zeroY,
        barHeight,
        positive,
      };
    });

    return {
      position,
      color: POSITION_COLOR[position],
      bars,
      zeroY,
      width: bars.length * (BAR_WIDTH + BAR_GAP),
    };
  }

  onBarHover(chartPos: string, bar: ChartBar | null): void {
    this.hoveredBar.set(bar ? { chartPos, bar } : null);
  }

  isHovered(chartPos: string, bar: ChartBar): boolean {
    const h = this.hoveredBar();
    return !!h && h.chartPos === chartPos && h.bar.sleeperId === bar.sleeperId;
  }

  readonly plotHeight = PLOT_HEIGHT;
  readonly barWidth = BAR_WIDTH;
}
