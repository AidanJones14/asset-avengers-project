import { Component, DestroyRef, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PortfolioStore } from '../../state/portfolio.store';
import { PageFrame } from '../../components/page-frame/page-frame';
import { OrderHistory } from '../../components/order-history/order-history';
import { InstrumentApiService } from '../../../api/instruments/instrument-api.service';
import { OrderApiService } from '../../../api/orders/order-api.service';
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
  private readonly destroyRef = inject(DestroyRef);

  constructor() { this.store.requestRefresh(); }

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
