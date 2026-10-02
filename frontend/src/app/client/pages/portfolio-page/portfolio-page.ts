import { Component, inject } from '@angular/core';
import { PortfolioStore } from '../../state/portfolio.store';
import { PageFrame } from '../../components/page-frame/page-frame';
import { PortfolioSummary } from '../../components/portfolio-summary/portfolio-summary';
import { HoldingsTable } from '../../components/holdings-table/holdings-table';
@Component({
  selector: 'app-portfolio-page',
  imports: [PageFrame, PortfolioSummary, HoldingsTable],
  templateUrl: './portfolio-page.html',
})
export class PortfolioPage {
  readonly store = inject(PortfolioStore);
}
