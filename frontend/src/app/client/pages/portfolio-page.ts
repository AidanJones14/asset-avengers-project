import { Component, inject } from '@angular/core';
import { PortfolioStore } from '../../portfolio.store';
import { PageFrame } from '../components/page-frame';
import { PortfolioSummary } from '../components/portfolio-summary';
import { HoldingsTable } from '../components/holdings-table';
@Component({
  selector: 'app-portfolio-page',
  imports: [PageFrame, PortfolioSummary, HoldingsTable],
  templateUrl: './portfolio-page.html',
})
export class PortfolioPage {
  readonly store = inject(PortfolioStore);
}
