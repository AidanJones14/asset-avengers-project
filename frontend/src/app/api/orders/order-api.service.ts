/**
 * Order HTTP adapter used by trade controls and order history. A create response
 * can be accepted while the persisted worker still awaits execution; later snapshots
 * supply the fill/rejection. The backend checks ownership and available resources.
 */

import { HttpClient } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { Observable, tap, timeout } from 'rxjs';
import { ApiOrder, CreateOrderRequest, UpdateOrderPricesRequest } from './order';

export const ORDER_SUBMIT_TIMEOUT_MS = 20_000;

export const ORDER_API_URL = new InjectionToken<string>('ORDER_API_URL', {
  providedIn: 'root',
  factory: () => '/api/v1/orders',
});

@Injectable({ providedIn: 'root' })
export class OrderApiService {
  private readonly http = inject(HttpClient);
  private readonly url = inject(ORDER_API_URL).replace(/\/+$/, '');

  getOrders(accountId?: string): Observable<ApiOrder[]> {
    return this.http.get<ApiOrder[]>(this.url, {
      params: accountId ? { accountId } : {},
    });
  }

  private readonly pending = new Map<string, string>();

  createOrder(order: CreateOrderRequest): Observable<ApiOrder> {
    // Keep unresolved submissions across dialog closes/reloads in this tab. A new
    // successful trade clears its key, so an intentional identical trade is allowed.
    const signature = JSON.stringify({ accountId: order.accountId,
      instrumentId: order.instrumentId ?? null, symbol: order.symbol?.trim().toUpperCase() ?? null,
      orderType: order.orderType, orderSide: order.orderSide, quantity: order.quantity,
      limitPrice: order.limitPrice, stopPrice: order.stopPrice });
    const storageKey = `endgame.pendingOrder:${this.url}:${signature}`;
    let key = this.pending.get(storageKey);
    try { key ??= sessionStorage.getItem(storageKey) ?? undefined; } catch { /* Storage may be unavailable. */ }
    key ??= crypto.randomUUID();
    this.pending.set(storageKey, key);
    try { sessionStorage.setItem(storageKey, key); } catch { /* The in-memory key still protects retries. */ }
    const requestKey = key;
    return this.http.post<ApiOrder>(this.url, order, { headers: { 'Idempotency-Key': requestKey } }).pipe(
      // Never leave the trade dialog on "Submitting…". The key is kept on error, so a retry
      // returns the same order instead of placing a second one.
      timeout(ORDER_SUBMIT_TIMEOUT_MS),
      tap(() => {
        if (this.pending.get(storageKey) === requestKey) this.pending.delete(storageKey);
        try {
          if (sessionStorage.getItem(storageKey) === requestKey) sessionStorage.removeItem(storageKey);
        } catch { /* Storage may be unavailable. */ }
      }),
    );
  }

  updateOrderPrices(orderId: string, prices: UpdateOrderPricesRequest): Observable<ApiOrder> {
    return this.http.patch<ApiOrder>(`${this.url}/${encodeURIComponent(orderId)}`, prices);
  }

  cancelOrder(orderId: string): Observable<ApiOrder> {
    return this.http.patch<ApiOrder>(`${this.url}/${encodeURIComponent(orderId)}/cancel`, {});
  }
}
