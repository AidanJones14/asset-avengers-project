/** Shows account history from saved transactions at acquisition cost.
 * Historical book values are separate from the current market-valued portfolio. */
import {
  afterNextRender, computed, Component, DestroyRef, effect, ElementRef, inject, input, signal, untracked, viewChild,
} from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { timer } from 'rxjs';
import { Chart, CategoryScale, LinearScale, LineController, LineElement, PointElement, Filler, Tooltip } from 'chart.js';
import { ThemeService } from '../../../shared/theme/theme.service';
import { PerformancePoint } from './performance-data';
import { PortfolioStore } from '../../state/portfolio.store';

Chart.register(CategoryScale, LinearScale, LineController, LineElement, PointElement, Filler, Tooltip);
const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

@Component({
  selector: 'app-performance-chart',
  imports: [CurrencyPipe, DatePipe],
  template: `
    <section class="panel performance">
      <div class="panel-heading"><h2>{{ aggregate() ? 'Investment Accounts History' : 'Portfolio history' }}</h2><span class="session-badge">Saved transactions</span></div>
      <div class="history-options" role="group" aria-label="History value"><button type="button" [attr.aria-pressed]="historyMode() === 'accountValue'" (click)="historyMode.set('accountValue')">{{ aggregate() ? 'Cash and Holdings' : 'Account total' }}</button><button type="button" [attr.aria-pressed]="historyMode() === 'holdingsCost'" (click)="historyMode.set('holdingsCost')">Holdings only</button></div>
      <p class="value-label">{{ aggregate() ? 'Current market-valued accounts' : 'Current market-valued portfolio' }}</p>
      <div class="chart-value">{{ value() | currency }}</div>
      <p class="return" [class.negative]="totalReturn() < 0">{{ totalReturn() | currency }}<span>Total return from recorded trades</span></p>
      <div class="chart-container">
        <canvas #canvas role="img" aria-label="Historical account or holdings value at acquisition cost. Exact values are in the chart data table." aria-describedby="performance-note"></canvas>
        @if (!ready() || store.historyLoading() && !points().length) { <p class="chart-status" role="status">Loading your portfolio…</p> }
      </div>
      <div class="chart-footer"><span class="chart-key"><i aria-hidden="true"></i>{{ historyMode() === 'accountValue' ? 'Cash and holdings cost' : 'Holdings at acquisition cost' }}</span><span>USD · All recorded history</span></div>
      <p class="chart-note" id="performance-note">Reconstructed from saved trades and cash movements across visits. Holdings use average acquisition cost, not past market prices. Deposits and withdrawals affect account total; this chart is not investment return.</p>
      @if (points().length < 2 && ready()) { <p class="chart-note">History appears as transactions are recorded.</p> }
      @if (store.historyError()) { <p class="chart-note negative" role="status">{{ store.historyError() }} <button type="button" (click)="store.refreshHistory()">Retry history</button></p> }
      @if (store.historyIncomplete()) { <p class="chart-note">Some earlier holdings have no recorded acquisition cost. Their historical values are unavailable.</p> }
      <details>
        <summary>View chart data</summary>
        <div class="table-wrap" tabindex="0" role="region" aria-label="Historical portfolio values">
          <table><thead><tr><th scope="col">Transaction time</th><th scope="col">Value at acquisition cost</th></tr></thead>
            <tbody>@for (point of points(); track point.timestamp) { <tr><td>{{ point.timestamp | date:'MMM d, h:mm:ss a' }}</td><td>{{ point.value | currency }}</td></tr> }</tbody>
          </table>
        </div>
      </details>
    </section>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .performance { height: 100%; }
    .panel-heading { flex-wrap: wrap; gap: 10px; }
    .history-options { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
    .history-options button { font-size: 11px; padding: 6px 10px; }
    .history-options button[aria-pressed=true] { color: var(--green); border-color: var(--green); }
    .session-badge { padding: 4px 8px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); font-size: 10px; }
    .value-label { margin: 18px 0 4px; color: var(--muted); font-size: 11px; }
    .chart-value { color: var(--text); font-size: 28px; font-weight: 600; letter-spacing: -.03em; font-variant-numeric: tabular-nums; }
    .return { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; margin-top: 5px; font-size: 12px; color: var(--green); }
    .return.negative { color: var(--down); }
    .return span { color: var(--muted); font-size: 10px; }
    .chart-container { position: relative; height: 220px; margin-top: 20px; }
    .chart-status { position: absolute; inset: 0; display: grid; place-items: center; color: var(--muted); font-size: 12px; }
    .chart-footer { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-top: 12px; color: var(--muted); font-size: 10px; }
    .chart-key { display: inline-flex; align-items: center; gap: 7px; color: var(--green); }
    .chart-key i { width: 14px; height: 2px; background: var(--green); }
    .chart-note { margin: 10px 0 0; color: var(--muted); font-size: 10px; line-height: 1.6; }
    details { margin-top: 14px; color: var(--muted); font-size: 11px; }
    summary { cursor: pointer; width: fit-content; }
    summary:focus-visible { outline: 2px solid var(--green); outline-offset: 3px; }
    .table-wrap { margin-top: 12px; max-height: 200px; overflow: auto; }
    @media (max-width: 600px) { .chart-container { height: 200px; } }
  `,
})
export class PerformanceChart {
  readonly value = input.required<number>();
  readonly totalReturn = input(0);
  readonly ready = input(true);
  readonly aggregate = input(false);
  readonly store = inject(PortfolioStore);
  readonly historyMode = signal<'accountValue' | 'holdingsCost'>('accountValue');
  readonly points = computed<PerformancePoint[]>(() => this.store.history().filter(row => row[this.historyMode()] != null).map(row => ({ timestamp: new Date(row.at).getTime(), value: row[this.historyMode()]! })));
  private historyKey = '';
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly destroyRef = inject(DestroyRef);
  private readonly theme = inject(ThemeService);
  private chart?: Chart<'line'>;

  constructor() {
    effect(() => { this.theme.mode(); untracked(() => this.updateChart()); });
    effect(() => {
      const ready=this.ready(); const value=this.value(); const totalReturn=this.totalReturn();
      const key=`${ready}:${value}:${totalReturn}`;
      untracked(() => { if(ready && key!==this.historyKey) { this.historyKey=key; this.store.refreshHistory(); } });
    });
    effect(() => { this.points(); this.historyMode(); untracked(() => this.updateChart()); });
    afterNextRender(() => {
      // Keep the data table available in environments without canvas support.
      if (typeof CanvasRenderingContext2D !== 'undefined') {
        this.chart = new Chart(this.canvas().nativeElement, {
          type: 'line',
          data: { labels: [], datasets: [{ label: 'Portfolio value', data: [],
            borderColor: '#b3f568', backgroundColor: '#b3f56815', fill: true,
            borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, stepped: true, tension: 0 }] },
          options: {
            responsive: true, maintainAspectRatio: false,
            animation: window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? false : { duration: 250 },
            interaction: { mode: 'index', intersect: false },
            plugins: { tooltip: { backgroundColor: '#1e2522', titleColor: '#ecf0ed', bodyColor: '#ecf0ed', padding: 12,
              callbacks: { label: context => 'Value at acquisition cost: ' + dollars.format(context.parsed.y ?? 0) } } },
            scales: {
              x: { grid: { display: false }, border: { display: false }, ticks: { color: '#919a9e', maxTicksLimit: 5, maxRotation: 0 } },
              y: { border: { display: false }, grid: { color: '#282d31' }, ticks: { color: '#919a9e', maxTicksLimit: 4,
                callback: value => dollars.format(Number(value)) } },
            },
          },
        });
        this.updateChart();
      }
      timer(15000, 15000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
        if (this.ready() && !document.hidden) this.store.refreshHistory();
      });
    });
    this.destroyRef.onDestroy(() => this.chart?.destroy());
  }

  private updateChart() {
    if (!this.chart) return;
    const light = this.theme.mode() === 'light';
    const muted = light ? '#5e6c63' : '#919a9e';
    this.chart.data.datasets[0].borderColor = light ? '#386b20' : '#b3f568';
    this.chart.data.datasets[0].backgroundColor = light ? '#386b2015' : '#b3f56815';
    this.chart.options.scales = {
      x: { grid: { display: false }, border: { display: false }, ticks: { color: muted, maxTicksLimit: 5, maxRotation: 0 } },
      y: { border: { display: false }, grid: { color: light ? '#d5ddd5' : '#282d31' }, ticks: { color: muted, maxTicksLimit: 4, callback: value => dollars.format(Number(value)) } },
    };
    const points = this.points();
    this.chart.data.labels = points.map(point => new Date(point.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }));
    this.chart.data.datasets[0].data = points.map(point => point.value);
    this.chart.data.datasets[0].pointRadius = points.length === 1 ? 3 : 0;
    this.chart.update();
  }
}
