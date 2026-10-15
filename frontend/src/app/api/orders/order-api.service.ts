/**
 * Order HTTP adapter used by trade controls and order history. A create response
 * can be accepted while the persisted worker still awaits execution; later snapshots
 * supply the fill/rejection. The backend checks ownership and available resources.
 */

import { HttpClient } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiOrder, CreateOrderRequest } from './order';

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

  createOrder(order: CreateOrderRequest): Observable<ApiOrder> {
    return this.http.post<ApiOrder>(this.url, order);
  }

  cancelOrder(orderId: string): Observable<ApiOrder> {
    return this.http.patch<ApiOrder>(`${this.url}/${encodeURIComponent(orderId)}/cancel`, {});
  }
}
