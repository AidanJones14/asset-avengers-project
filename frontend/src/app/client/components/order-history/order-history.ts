/**
 * Presents persisted order status and emits cancellation requests to its parent.
 * This table does not release reservations itself; the server's cancellation does.
 */

import { Component, input, output } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { Order } from '../../state/portfolio.store';
@Component({
  selector: 'app-order-history',
  imports: [CurrencyPipe, DatePipe],
  templateUrl: './order-history.html',
  styles: `
    :host { display: block; min-width: 0; }
    .order-time { display: block; margin-top: 6px; color: var(--muted); font-size: 11px; white-space: nowrap; }
    .order-status { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; }
    .cancel-order { padding: 4px 8px; min-height: 30px; font-size: 12px; white-space: nowrap; }
  `,
})
export class OrderHistory {
  readonly orders = input.required<Order[]>();
  readonly cancellingOrderId = input<string | null>(null);
  readonly trade = output<void>();
  readonly cancelOrder = output<string>();
}
