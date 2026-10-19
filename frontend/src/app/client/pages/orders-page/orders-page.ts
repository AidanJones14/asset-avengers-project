/**
 * Connects the history table to OrderApiService cancellation and price changes. The
 * returned order updates the store; subsequent account snapshots reconcile reservations.
 */

import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PortfolioStore } from '../../state/portfolio.store';
import { PageFrame } from '../../components/page-frame/page-frame';
import { OrderHistory, OrderPriceChange } from '../../components/order-history/order-history';
import { OrderApiService } from '../../../api/orders/order-api.service';
@Component({
  selector: 'app-orders-page',
  imports: [PageFrame, OrderHistory],
  templateUrl: './orders-page.html',
})
export class OrdersPage {
  readonly store = inject(PortfolioStore);
  readonly cancellingOrderId = signal<string | null>(null);
  readonly updatingOrderId = signal<string | null>(null);
  readonly actionError = signal('');
  private readonly ordersApi = inject(OrderApiService);
  private readonly destroyRef = inject(DestroyRef);

  constructor() { this.store.requestRefresh(); }

  cancelOrder(orderId: string): void {
    if (this.cancellingOrderId()) return;
    this.cancellingOrderId.set(orderId);
    this.actionError.set('');
    this.ordersApi.cancelOrder(orderId).pipe(
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: order => {
        this.store.updateOrderStatus(order.orderId, order.status);
        this.cancellingOrderId.set(null);
        this.store.requestRefresh();
      },
      error: () => {
        this.actionError.set('Unable to cancel the order. Please try again.');
        this.cancellingOrderId.set(null);
      },
    });
  }

  updatePrices({ orderId, prices }: OrderPriceChange): void {
    if (this.updatingOrderId()) return;
    this.updatingOrderId.set(orderId);
    this.actionError.set('');
    this.ordersApi.updateOrderPrices(orderId, prices).pipe(
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: order => {
        this.store.updateOrder(order.orderId, {
          status: order.status, limitPrice: order.limitPrice, stopPrice: order.stopPrice,
          stopTriggered: order.stopTriggered,
        });
        this.updatingOrderId.set(null);
        this.store.requestRefresh();
      },
      error: err => {
        // The server revalidates the whole order, e.g. cash for a higher buy limit.
        this.actionError.set(err.error?.detail || 'Unable to change the order prices. Please try again.');
        this.updatingOrderId.set(null);
      },
    });
  }
}
