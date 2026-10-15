/**
 * Despite the historical component name, this renders current value/return inputs.
 * No historical pricing series is available, so it does not invent a performance curve.
 */

import { Component, input } from '@angular/core';
import { CurrencyPipe } from '@angular/common';

@Component({
  selector: 'app-performance-chart',
  imports: [CurrencyPipe],
  template: `<section class="panel"><div class="panel-heading"><h2>Portfolio performance</h2></div>
    <p>Current portfolio value</p><div class="value">{{ value() | currency }}</div>
    <p>Total return from recorded trades</p><div [class.negative]="totalReturn() < 0">{{ totalReturn() | currency }}</div>
    <p class="small">Cash and holdings are restored from your account. Prices use the latest available market quotes.</p>
  </section>`,
  styles: `:host { display:block; min-width:0; } .panel { height:100%; } .value { font-size:28px; margin:12px 0; } p { margin-top:16px; }`,
})
export class PerformanceChart {
  readonly value = input.required<number>();
  readonly totalReturn = input(0);
}
