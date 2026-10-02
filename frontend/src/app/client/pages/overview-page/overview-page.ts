import { Component, inject } from '@angular/core';
import { PortfolioStore } from '../../state/portfolio.store';
import { PageFrame } from '../../components/page-frame/page-frame';
import { PortfolioSummary } from '../../components/portfolio-summary/portfolio-summary';
import { HoldingsTable } from '../../components/holdings-table/holdings-table';
import { MarketWatch } from '../../components/market-watch/market-watch';
import { PerformanceChart } from '../../components/performance-chart/performance-chart';
import { PortfolioAllocation } from '../../components/portfolio-allocation/portfolio-allocation';
@Component({
  selector: 'app-overview-page',
  imports: [PageFrame, PortfolioSummary, HoldingsTable, MarketWatch, PerformanceChart, PortfolioAllocation],
  templateUrl: './overview-page.html',
})
export class OverviewPage {
  readonly store = inject(PortfolioStore);
}
