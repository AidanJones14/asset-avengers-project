import { Component, inject } from '@angular/core';
import { PortfolioStore } from '../../portfolio.store';
import { PageFrame } from '../components/page-frame';
import { OrderHistory } from '../components/order-history';
@Component({
  selector: 'app-orders-page',
  imports: [PageFrame, OrderHistory],
  templateUrl: './orders-page.html',
})
export class OrdersPage {
  readonly store = inject(PortfolioStore);
}
