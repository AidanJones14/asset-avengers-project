import { Component, DestroyRef, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PortfolioStore } from '../../state/portfolio.store';
import { PageFrame } from '../../components/page-frame/page-frame';
import { OrderHistory } from '../../components/order-history/order-history';
import { InstrumentApiService } from '../../../api/instruments/instrument-api.service';
import { ACTIVE_ACCOUNT_ID, OrderApiService } from '../../../api/orders/order-api.service';
@Component({
  selector: 'app-orders-page',
  imports: [PageFrame, OrderHistory],
  templateUrl: './orders-page.html',
})
export class OrdersPage {
  readonly store = inject(PortfolioStore);
  readonly cancellingOrderId = signal<string | null>(null);
  readonly cancellationError = signal('');
  private readonly ordersApi = inject(OrderApiService);
  private readonly instrumentsApi = inject(InstrumentApiService);
  private readonly accountId = inject(ACTIVE_ACCOUNT_ID);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    forkJoin({
      orders: this.ordersApi.getOrders(this.accountId),
      instruments: this.instrumentsApi.getAllInstruments(),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ orders, instruments }) => {
        const symbols = new Map(instruments.map(value => [value.instrumentId, value.symbol]));
        this.store.instruments.set(instruments);
        this.store.replaceOrders(orders.map(order => ({
          id: order.orderId,
          symbol: symbols.get(order.instrumentId) ?? 'Unknown',
          side: order.orderSide,
          quantity: order.quantity,
          total: order.price != null
            ? order.quantity * order.price
            : order.limitPrice != null
              ? order.quantity * order.limitPrice
              : null,
          status: order.status,
        })));
      },
    });
  }

  cancelOrder(orderId: string): void {
    if (this.cancellingOrderId()) return;
    this.cancellingOrderId.set(orderId);
    this.cancellationError.set('');
    this.ordersApi.cancelOrder(orderId).pipe(
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: order => {
        this.store.updateOrderStatus(order.orderId, order.status);
        this.cancellingOrderId.set(null);
      },
      error: () => {
        this.cancellationError.set('Unable to cancel the order. Please try again.');
        this.cancellingOrderId.set(null);
      },
    });
  }
}
