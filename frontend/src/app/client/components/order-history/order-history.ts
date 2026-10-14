import { Component, input, output } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { Order } from '../../state/portfolio.store';
@Component({
  selector: 'app-order-history',
  imports: [CurrencyPipe],
  templateUrl: './order-history.html',
  styles: `
    :host { display: block; min-width: 0; }
    .cancel-order { padding: 6px 10px; white-space: nowrap; }
  `,
})
export class OrderHistory {
  readonly orders = input.required<Order[]>();
  readonly cancellingOrderId = input<string | null>(null);
  readonly trade = output<void>();
  readonly cancelOrder = output<string>();
}
