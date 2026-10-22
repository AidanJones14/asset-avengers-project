/**
 * Derives the allocation display from the current store and passes chart data to
 * the shared renderer. It is a current portfolio view, not a historical reporting batch.
 */

import { Component, computed, inject } from '@angular/core';
import { AllocationChart } from '../../../shared/components/allocation-chart/allocation-chart';
import { PortfolioStore } from '../../state/portfolio.store';

@Component({
  selector: 'app-portfolio-allocation',
  imports: [AllocationChart],
  template: `<section class="panel"><div class="panel-heading"><h2>Portfolio allocation</h2><span class="small">By market value</span></div><div class="allocation-body" tabindex="0" aria-label="Portfolio allocation contents"><app-allocation-chart [items]="allocation()" [listLegend]="true" /><p class="small">Live holdings and cash balance</p></div></section>`,
  styles: `:host { display: block; min-width: 0; } .panel { height: var(--overview-widget-height, auto); box-sizing: border-box; display:flex; flex-direction:column; } .panel-heading { flex-shrink:0; } .allocation-body { min-height:0; overflow-y:auto; scrollbar-gutter:stable; overscroll-behavior-y:contain; } p { margin-top: 20px; }`,
})
export class PortfolioAllocation {
  private readonly store = inject(PortfolioStore);
  readonly allocation = computed(() => {
    const colors = ['#b3f568', '#80bca3', '#85aee0', '#c9adf0', '#e2bf83'];
    return [
      ...this.store.holdings().map((asset, index) => ({ name: asset.symbol, value: asset.shares * asset.price, color: colors[index % colors.length] })),
      { name: 'Cash', value: this.store.cashBalance(), color: '#647b88' },
    ];
  });
}
