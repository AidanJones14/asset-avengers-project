/**
 * Connects the history table to OrderApiService cancellation and price changes. The
 * returned order updates the store; subsequent account snapshots reconcile reservations.
 */

import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Subject, catchError, exhaustMap, merge, of, switchMap, timeout, timer } from 'rxjs';
import { toObservable } from '@angular/core/rxjs-interop';
import { ApiOrder } from '../../../api/orders/order';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PortfolioStore } from '../../state/portfolio.store';
import { PageFrame } from '../../components/page-frame/page-frame';
import { DisputeForm } from '../../components/dispute-form/dispute-form';
import { OrderHistory, OrderPriceChange } from '../../components/order-history/order-history';
import { AccountApiService } from '../../../api/accounts/account-api.service';
import { OrderApiService } from '../../../api/orders/order-api.service';
@Component({
  selector: 'app-orders-page',
  imports: [PageFrame, OrderHistory, DisputeForm],
  templateUrl: './orders-page.html',
})
export class OrdersPage {
  readonly store = inject(PortfolioStore);
  readonly accountApi = inject(AccountApiService);
  readonly cancellingOrderId = signal<string | null>(null);
  readonly updatingOrderId = signal<string | null>(null);
  readonly actionError = signal('');
  private readonly ordersApi = inject(OrderApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly accountFilter = signal('all');
  readonly loading = signal(true);
  readonly loadError = signal('');
  private readonly rows = signal<ApiOrder[]>([]);
  private readonly refreshOrders = new Subject<void>();
  readonly orders = computed(() => this.rows().map(order => ({
    id: order.orderId, accountId: order.accountId,
    symbol: this.store.instruments().find(instrument => instrument.instrumentId === order.instrumentId)?.symbol
      ?? this.store.assets().find(asset => asset.instrumentId === order.instrumentId)?.symbol ?? 'Unknown',
    side: order.orderSide, quantity: order.quantity, status: order.status,
    total: order.price == null ? null : order.price * order.quantity,
    submittedAt: order.submittedAt, executionPrice: order.price, finalizedAt: order.finalizedAt,
    updatedAt: order.updatedAt, rejectionReason: order.rejectionReason,
    type: order.orderType, limitPrice: order.limitPrice, stopPrice: order.stopPrice,
    stopTriggered: order.stopTriggered,
  })));

  constructor() {
    toObservable(this.accountFilter).pipe(
      switchMap(accountId => merge(timer(0, 3000), this.refreshOrders).pipe(
        exhaustMap(() => this.ordersApi.getOrders(accountId === 'all' ? undefined : accountId).pipe(
          timeout(15000),
          catchError(() => {
            this.loadError.set('Unable to load orders. Please try again.');
            this.loading.set(false);
            return of(null);
          }),
        )),
      )),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(rows => {
      if (rows === null) return;
      this.rows.set(rows);
      this.loading.set(false);
      this.loadError.set('');
    });
  }

  selectAccount(accountId: string): void {
    if (accountId === this.accountFilter()) return;
    this.rows.set([]);
    this.loading.set(true);
    this.loadError.set('');
    this.actionError.set('');
    this.accountFilter.set(accountId);
  }

  retryOrders(): void {
    this.loading.set(true);
    this.loadError.set('');
    this.refreshOrders.next();
  }

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
        this.refreshOrders.next();
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
        this.refreshOrders.next();
      },
      error: err => {
        // The server revalidates the whole order, e.g. cash for a higher buy limit.
        this.actionError.set(err.error?.detail || 'Unable to change the order prices. Please try again.');
        this.updatingOrderId.set(null);
      },
    });
  }
}
