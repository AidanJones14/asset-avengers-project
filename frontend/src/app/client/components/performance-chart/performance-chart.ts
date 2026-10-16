/** Records actual account-value observations for this page session, including cash flows.
 * This chart does not invent historical returns or persist portfolio valuations. */
import {
  afterNextRender, Component, DestroyRef, effect, ElementRef, inject, input, signal, untracked, viewChild,
} from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { timer } from 'rxjs';
import { Chart, CategoryScale, LinearScale, LineController, LineElement, PointElement, Filler, Tooltip } from 'chart.js';
import { PerformancePoint, recordPerformancePoint } from './performance-data';

Chart.register(CategoryScale, LinearScale, LineController, LineElement, PointElement, Filler, Tooltip);
const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

@Component({
  selector: 'app-performance-chart',
  imports: [CurrencyPipe, DatePipe],
  template: `
    <section class="panel performance">
      <div class="panel-heading"><h2>Portfolio performance</h2><span class="session-badge">This session</span></div>
      <p class="value-label">Current portfolio value</p>
      <div class="chart-value">{{ value() | currency }}</div>
      <p class="return" [class.negative]="totalReturn() < 0">{{ totalReturn() | currency }}<span>Total return from recorded trades</span></p>
      <div class="chart-container">
        <canvas #canvas role="img" aria-label="Observed portfolio value during this session. Exact values are in the chart data table." aria-describedby="performance-note"></canvas>
        @if (!ready()) { <p class="chart-status" role="status">Loading your portfolio…</p> }
      </div>
      <div class="chart-footer"><span class="chart-key"><i aria-hidden="true"></i>Portfolio value</span><span>USD · Observed every 15 seconds</span></div>
      <p class="chart-note" id="performance-note">Recorded while this page is open. Includes deposits and withdrawals; this is account value, not a return percentage.</p>
      @if (points().length < 2 && ready()) { <p class="chart-note">The line will build as new observations arrive.</p> }
      <details>
        <summary>View chart data</summary>
        <div class="table-wrap" tabindex="0" role="region" aria-label="Observed portfolio values">
          <table><thead><tr><th scope="col">Observed at</th><th scope="col">Portfolio value</th></tr></thead>
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
  readonly points = signal<PerformancePoint[]>([]);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly destroyRef = inject(DestroyRef);
  private chart?: Chart<'line'>;

  constructor() {
    effect(() => {
      const ready = this.ready();
      const value = this.value();
      untracked(() => {
        if (ready) this.record(value);
        else { this.points.set([]); this.updateChart(); }
      });
    });
    afterNextRender(() => {
      // Keep the data table available in environments without canvas support.
      if (typeof CanvasRenderingContext2D !== 'undefined') {
        this.chart = new Chart(this.canvas().nativeElement, {
          type: 'line',
          data: { labels: [], datasets: [{ label: 'Portfolio value', data: [],
            borderColor: '#b3f568', backgroundColor: '#b3f56815', fill: true,
            borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: .2 }] },
          options: {
            responsive: true, maintainAspectRatio: false,
            animation: window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? false : { duration: 250 },
            interaction: { mode: 'index', intersect: false },
            plugins: { tooltip: { backgroundColor: '#1e2522', titleColor: '#ecf0ed', bodyColor: '#ecf0ed', padding: 12,
              callbacks: { label: context => 'Portfolio value: ' + dollars.format(context.parsed.y ?? 0) } } },
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
        if (this.ready() && !document.hidden) this.record(this.value());
      });
    });
    this.destroyRef.onDestroy(() => this.chart?.destroy());
  }

  private record(value: number) {
    this.points.update(history => recordPerformancePoint(history, value, Date.now()));
    this.updateChart();
  }

  private updateChart() {
    if (!this.chart) return;
    const points = this.points();
    this.chart.data.labels = points.map(point => new Date(point.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }));
    this.chart.data.datasets[0].data = points.map(point => point.value);
    this.chart.data.datasets[0].pointRadius = points.length === 1 ? 3 : 0;
    this.chart.update();
  }
}
