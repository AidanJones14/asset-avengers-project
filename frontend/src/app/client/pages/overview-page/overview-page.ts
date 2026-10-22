import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AccountApiService } from '../../../api/accounts/account-api.service';
import { PortfolioStore } from '../../state/portfolio.store';
import { PageFrame } from '../../components/page-frame/page-frame';
import { PortfolioSummary } from '../../components/portfolio-summary/portfolio-summary';
import { HoldingsTable } from '../../components/holdings-table/holdings-table';
import { MarketWatch } from '../../components/market-watch/market-watch';
import { PerformanceChart } from '../../components/performance-chart/performance-chart';
import { PortfolioAllocation } from '../../components/portfolio-allocation/portfolio-allocation';
@Component({
  selector: 'app-overview-page',
  imports: [PageFrame, PortfolioSummary, HoldingsTable, MarketWatch, PerformanceChart, PortfolioAllocation, RouterLink],
  styleUrl: './overview-page.css',
  templateUrl: './overview-page.html',
})
export class OverviewPage {
  readonly store = inject(PortfolioStore);
  private readonly accountApi = inject(AccountApiService);
  readonly hasInvestmentAccount = computed(() => this.accountApi.accounts().length > 0);
  readonly performanceReady = computed(() => this.hasInvestmentAccount()
    && !this.store.aggregateLoading()
    && this.store.aggregateHoldings().every(asset => Number.isFinite(asset.price) && asset.price > 0));
}
