import { Component, inject } from '@angular/core';
import { PortfolioStore } from '../../state/portfolio.store';
import { PageFrame } from '../../components/page-frame/page-frame';
import { OrderHistory } from '../../components/order-history/order-history';
@Component({
  selector: 'app-orders-page',
  imports: [PageFrame, OrderHistory],
  templateUrl: './orders-page.html',
})
export class OrdersPage {
  readonly store = inject(PortfolioStore);
}
