import { HttpClient } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiOrder, CreateOrderRequest } from './order';

export const ORDER_API_URL = new InjectionToken<string>('ORDER_API_URL', {
  providedIn: 'root',
  factory: () => '/api/v1/orders',
});

export const ACTIVE_ACCOUNT_ID = new InjectionToken<string>('ACTIVE_ACCOUNT_ID', {
  providedIn: 'root',
  factory: () => '20000000-0000-0000-0000-000000000001',
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
    return this.http.patch<ApiOrder>(`${this.url}/${encodeURIComponent(orderId)}/status`, {});
  }
}
