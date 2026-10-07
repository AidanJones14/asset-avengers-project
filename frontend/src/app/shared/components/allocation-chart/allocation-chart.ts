import { Component, computed, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';

export interface AllocationItem { name: string; value: number; color: string; }

@Component({
  selector: 'app-allocation-chart',
  imports: [DecimalPipe],
  template: `
    <div class="allocation">
      <div class="donut" [style.background]="gradient()" role="img" [attr.aria-label]="description()">
        <div><strong>{{ slices().length }}</strong><span>{{ label() }}</span></div>
      </div>
      <div class="legend" [class.legend-list]="listLegend()">
        @for (item of slices(); track item.name) {
          <div><span><i [style.background]="item.color"></i>{{ item.name }}</span><strong>{{ item.percent | number:'1.1-1' }}%</strong></div>
        }
      </div>
    </div>
  `,
  styles: `
    :host { display: block; }
    .allocation { display: grid; justify-items: center; gap: 18px; }
    .donut { width: 140px; height: 140px; border-radius: 50%; padding: 15px; }
    .donut > div { height: 100%; border-radius: 50%; background: var(--panel); display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .donut strong { font-size: 28px; }
    .donut span { color: var(--muted); font-size: 10px; }
    .legend { width: 100%; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; font-size: 11px; }
    .legend strong { display: block; margin-top: 4px; }
    .legend-list { grid-template-columns: 1fr; gap: 0; font-size: 12px; }
    .legend-list > div { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 7px 0; }
    .legend-list > div > span { display: flex; align-items: center; gap: 9px; }
    .legend-list strong { margin: 0; font-weight: 400; color: var(--muted); font-variant-numeric: tabular-nums; }
    .legend-list i { margin: 0; }
    i { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 5px; }
  `,
})
export class AllocationChart {
  readonly items = input.required<AllocationItem[]>();
  readonly label = input('positions');
  readonly listLegend = input(false);
  readonly slices = computed(() => {
    const positive = this.items().filter(item => item.value > 0);
    const total = positive.reduce((sum, item) => sum + item.value, 0);
    return positive.map(item => ({ ...item, percent: item.value / total * 100 }));
  });
  readonly description = computed(() => this.slices().length
    ? this.slices().map(item => `${item.name} ${item.percent.toFixed(1)}%`).join(', ')
    : 'No assets to display');
  readonly gradient = computed(() => {
    let start = 0;
    const stops = this.slices().map(item => {
      const end = start + item.percent;
      const stop = `${item.color} ${start}% ${end}%`;
      start = end;
      return stop;
    });
    return stops.length ? `conic-gradient(${stops.join(',')})` : 'var(--line)';
  });
}
