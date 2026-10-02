import { Component, computed, inject } from '@angular/core';
import { AllocationChart } from '../../../shared/components/allocation-chart/allocation-chart';
import { PortfolioStore } from '../../state/portfolio.store';

@Component({
  selector: 'app-portfolio-allocation',
  imports: [AllocationChart],
  template: `<section class="panel"><div class="panel-heading"><h2>Portfolio allocation</h2><span class="small">By market value</span></div><app-allocation-chart [items]="allocation()" [listLegend]="true" /><p class="small">Holdings and available cash · Sample data</p></section>`,
  styles: `:host { display: block; min-width: 0; } .panel { height: 100%; } p { margin-top: 20px; }`,
})
export class PortfolioAllocation {
  private readonly store = inject(PortfolioStore);
  readonly allocation = computed(() => {
    const colors = ['#b3f568', '#80bca3', '#85aee0', '#c9adf0', '#e2bf83'];
    return [
      ...this.store.holdings().map((asset, index) => ({ name: asset.symbol, value: asset.shares * asset.price, color: colors[index % colors.length] })),
      { name: 'Cash', value: this.store.cash(), color: '#647b88' },
    ];
  });
}
