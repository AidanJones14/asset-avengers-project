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

  afterEach(() => http.verify());

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

  it('cancels an order using the backend status endpoint', () => {
    service.cancelOrder('order/1').subscribe();
    const request = http.expectOne('/api/v1/orders/order%2F1/status');
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
