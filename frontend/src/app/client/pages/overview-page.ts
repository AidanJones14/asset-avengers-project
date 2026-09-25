import { Component, inject } from '@angular/core';
import { PortfolioStore } from '../../portfolio.store';
import { PageFrame } from '../components/page-frame';
import { PortfolioSummary } from '../components/portfolio-summary';
import { HoldingsTable } from '../components/holdings-table';
import { MarketWatch } from '../components/market-watch';
import { PerformanceChart } from '../../performance-chart';
@Component({
  selector: 'app-overview-page',
  imports: [PageFrame, PortfolioSummary, HoldingsTable, MarketWatch, PerformanceChart],
  templateUrl: './overview-page.html',
})
export class OverviewPage {
  readonly store = inject(PortfolioStore);
}
