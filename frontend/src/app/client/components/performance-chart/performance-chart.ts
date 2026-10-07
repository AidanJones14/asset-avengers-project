import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import {
  Chart,
  CategoryScale,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Filler,
  Tooltip,
} from 'chart.js';
import { ChartRange, rangeHistory, sampleHistory } from './performance-data';

Chart.register(
  CategoryScale,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Filler,
  Tooltip,
);

@Component({
  selector: 'app-performance-chart',
  imports: [CurrencyPipe, DecimalPipe],
  template: `
    <section class="panel performance">
      <div class="panel-heading">
        <h2>Portfolio performance</h2>
        <div class="ranges" role="group" aria-label="Performance date range">
          @for (period of ranges; track period) {
            <button
              type="button"
              [class.selected]="range() === period"
              [attr.aria-pressed]="range() === period"
              (click)="range.set(period)"
            >
              {{ period }}
            </button>
          }
        </div>
      </div>
      <div class="chart-value">{{ value() | currency }}</div>
      <p class="positive" [class.negative]="change() < 0" aria-live="polite">
        {{ change() >= 0 ? '+' : '' }}{{ change() | currency }} ({{ change() >= 0 ? '+' : ''
        }}{{ percent() | number: '1.2-2' }}%) <span class="small">in selected period</span>
      </p>
      <div class="chart-container">
        <canvas
          #canvas
          role="img"
          [attr.aria-label]="
            'Illustrative portfolio and benchmark history for ' +
            range() +
            '. Exact values are available in the data table below.'
          "
        ></canvas>
      </div>
      <div class="chart-footer">
        <div class="chart-key"><span>━ Portfolio</span><span>┄ Benchmark</span></div>
        <span class="small">Illustrative history · USD</span>
      </div>
      <details>
        <summary>View chart data</summary>
        <div class="table-wrap" tabindex="0" role="region" aria-label="Performance data">
          <table>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Portfolio</th>
                <th scope="col">Benchmark</th>
              </tr>
            </thead>
            <tbody>
              @for (point of points(); track point.date) {
                <tr>
                  <td>{{ point.date }}</td>
                  <td>{{ point.portfolio | currency }}</td>
                  <td>{{ point.benchmark | currency }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </details>
    </section>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .panel {
      height: 100%;
    }
    .panel-heading {
      flex-wrap: wrap;
      gap: 10px;
    }
    .ranges {
      display: flex;
      gap: 3px;
    }
    .ranges button {
      border: 0;
      min-height: 32px;
      padding: 5px 9px;
      font-size: 12px;
      color: var(--muted);
    }
    .ranges button.selected {
      background: var(--active);
      color: var(--green);
    }
    .chart-container {
      height: 220px;
      position: relative;
      margin-top: 18px;
    }
    .chart-footer {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 12px;
    }
    .chart-key {
      display: flex;
      gap: 20px;
      font-size: 12px;
      color: var(--green);
    }
    .chart-key span + span {
      color: #91a6a0;
    }
    details {
      margin-top: 16px;
      color: var(--muted);
      font-size: 12px;
    }
    summary {
      cursor: pointer;
      width: fit-content;
    }
    summary:focus-visible {
      outline: 2px solid var(--green);
      outline-offset: 3px;
    }
    details .table-wrap {
      max-height: 240px;
      margin-top: 12px;
    }
    @media (max-width: 600px) {
      .chart-container {
        height: 200px;
      }
    }
  `,
})
export class PerformanceChart {
  readonly value = input.required<number>();
  readonly ranges: ChartRange[] = ['1W', '1M', '3M', '1Y'];
  readonly range = signal<ChartRange>('1M');
  private readonly history = sampleHistory(124675.45);
  readonly points = computed(() => {
    const history = this.history.map((point, index) =>
      index === this.history.length - 1 ? { ...point, portfolio: this.value() } : point,
    );
    return rangeHistory(history, this.range());
  });
  readonly change = computed(() => this.points().at(-1)!.portfolio - this.points()[0].portfolio);
  readonly percent = computed(() => (this.change() / this.points()[0].portfolio) * 100);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private chart?: Chart<'line'>;
  constructor() {
    afterNextRender(() => {
      this.chart = new Chart(this.canvas().nativeElement, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            {
              label: 'Portfolio',
              data: [],
              borderColor: '#b3f568',
              backgroundColor: '#b3f56815',
              fill: true,
              borderWidth: 2,
              pointRadius: 0,
              pointHoverRadius: 4,
              tension: 0.2,
            },
            {
              label: 'Benchmark',
              data: [],
              borderColor: '#91a6a0',
              borderDash: [4, 4],
              borderWidth: 1.5,
              pointRadius: 0,
              pointHoverRadius: 4,
              tension: 0.2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? false
            : { duration: 250 },
          interaction: { mode: 'index', intersect: false },
          plugins: {
            tooltip: {
              backgroundColor: '#1e2522',
              titleColor: '#ecf0ed',
              bodyColor: '#ecf0ed',
              padding: 12,
              callbacks: {
                label: (context) =>
                  context.dataset.label +
                  ': ' +
                  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
                    context.parsed.y ?? 0,
                  ),
              },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              border: { display: false },
              ticks: {
                color: '#919a9e',
                maxTicksLimit: 5,
                maxRotation: 0,
                callback: function (value) {
                  const date = this.getLabelForValue(Number(value));
                  return new Date(date + 'T00:00:00Z').toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    timeZone: 'UTC',
                  });
                },
              },
            },
            y: {
              border: { display: false },
              grid: { color: '#282d31' },
              ticks: {
                color: '#919a9e',
                maxTicksLimit: 4,
                callback: (value) => '$' + (Number(value) / 1000).toFixed(0) + 'k',
              },
            },
          },
        },
      });
      this.updateChart();
    });
    effect(() => {
      this.points();
      this.updateChart();
    });
    inject(DestroyRef).onDestroy(() => this.chart?.destroy());
  }
  private updateChart() {
    if (!this.chart) return;
    const points = this.points();
    this.chart.data.labels = points.map((point) => point.date);
    this.chart.data.datasets[0].data = points.map((point) => point.portfolio);
    this.chart.data.datasets[1].data = points.map((point) => point.benchmark);
    this.chart.update();
  }
}
