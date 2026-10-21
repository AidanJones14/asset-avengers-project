import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ORDER_API_URL, OrderApiService } from './order-api.service';

describe('OrderApiService', () => {
  let service: OrderApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(OrderApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    for (const key of Object.keys(sessionStorage)) if (key.startsWith('endgame.pendingOrder:')) sessionStorage.removeItem(key);
  });

  it('loads orders scoped to an account', () => {
    service.getOrders('account-1').subscribe(value => expect(value).toEqual([]));
    const request = http.expectOne('/api/v1/orders?accountId=account-1');
    expect(request.request.method).toBe('GET');
    request.flush([]);
  });

  it('creates an order using the backend contract', () => {
    const order = {
      accountId: 'account-1', instrumentId: 'instrument-1', orderType: 'market' as const,
      orderSide: 'buy' as const, quantity: 2, limitPrice: null, stopPrice: null,
    };
    service.createOrder(order).subscribe();
    const request = http.expectOne('/api/v1/orders');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(order);
    request.flush({ ...order, orderId: 'order-1', price: null, status: 'submitted',
      submittedAt: '2026-10-07T00:00:00Z', updatedAt: '2026-10-07T00:00:00Z' });
  });

  it('reuses the request key after a lost response and a service reload, then allows an intentional new order', () => {
    const order = { accountId: 'account-1', symbol: 'AAPL', orderType: 'market' as const,
      orderSide: 'buy' as const, quantity: 2, limitPrice: null, stopPrice: null };
    service.createOrder(order).subscribe({ error: () => {} });
    const first = http.expectOne('/api/v1/orders');
    const key = first.request.headers.get('Idempotency-Key');
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    first.flush({}, { status: 503, statusText: 'Response lost' });
    service = TestBed.runInInjectionContext(() => new OrderApiService());
    service.createOrder(order).subscribe();
    const retry = http.expectOne('/api/v1/orders');
    expect(retry.request.headers.get('Idempotency-Key')).toBe(key);
    retry.flush({ orderId: 'same-order', status: 'accepted' });
    service.createOrder(order).subscribe();
    const next = http.expectOne('/api/v1/orders');
    expect(next.request.headers.get('Idempotency-Key')).not.toBe(key);
    next.flush({ orderId: 'new-order', status: 'accepted' });
  });

  it('uses different keys for different details and accounts', () => {
    const order = { accountId: 'one', symbol: 'AAPL', orderType: 'limit' as const,
      orderSide: 'buy' as const, quantity: 2, limitPrice: 50, stopPrice: null };
    const keys = [];
    for (const body of [order, { ...order, quantity: 3 }, { ...order, accountId: 'two' }]) {
      service.createOrder(body).subscribe({ error: () => {} });
      const request = http.expectOne('/api/v1/orders');
      keys.push(request.request.headers.get('Idempotency-Key'));
      request.flush({}, { status: 503, statusText: 'Unavailable' });
    }
    expect(new Set(keys).size).toBe(3);
  });

  it('changes only the given limit/stop prices', () => {
    service.updateOrderPrices('order/1', { stopPrice: 51 }).subscribe();
    const request = http.expectOne('/api/v1/orders/order%2F1');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ stopPrice: 51 });
    request.flush({ orderId: 'order/1', status: 'accepted', stopPrice: 51 });
  });

  it('cancels an order using the backend cancel endpoint', () => {
    service.cancelOrder('order/1').subscribe();
    const request = http.expectOne('/api/v1/orders/order%2F1/cancel');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({});
    request.flush({ orderId: 'order/1', status: 'cancelled' });
  });

  it('supports an overridden API URL', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(),
      { provide: ORDER_API_URL, useValue: 'https://api.example.test/orders/' },
    ] });
    service = TestBed.inject(OrderApiService);
    http = TestBed.inject(HttpTestingController);
    service.getOrders().subscribe();
    http.expectOne('https://api.example.test/orders').flush([]);
  });
});
