import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OrdersPage } from './orders-page';

describe('OrdersPage account views', () => {
  let fixture: ComponentFixture<OrdersPage>;
  let http: HttpTestingController;
  const row = (accountId: string) => ({ orderId: `${accountId}-order`, accountId,
    instrumentId: 'aapl', orderSide: 'buy', quantity: 1, price: 100, status: 'filled', orderType: 'market' });
  async function render() {
    fixture.detectChanges();
    for (const request of http.match(req => req.url === '/api/v1/me/disputes' || req.url === '/api/v1/me/accounts')) {
      request.flush([]);
    }
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [OrdersPage],
      providers: [provideHttpClient(), provideHttpClientTesting()] });
    fixture = TestBed.createComponent(OrdersPage);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { fixture.destroy(); http.verify(); });

  it('defaults to all accounts and filters without changing the trading account', async () => {
    const page = fixture.componentInstance;
    page.store.accountId.set('first');
    await render();
    http.expectOne('/api/v1/orders').flush([row('first'), row('second')]);
    expect(page.orders().map(order => order.accountId)).toEqual(['first', 'second']);
    page.selectAccount('second');
    expect(page.orders()).toEqual([]);
    await render();
    http.expectOne('/api/v1/orders?accountId=second').flush([row('second')]);
    expect(page.orders().map(order => order.accountId)).toEqual(['second']);
    expect(page.store.accountId()).toBe('first');
    page.selectAccount('all');
    await render();
    http.expectOne('/api/v1/orders').flush([]);
    expect(page.loading()).toBe(false);
  });

  it('shows an error instead of an empty state and allows retry', async () => {
    const page = fixture.componentInstance;
    await render();
    http.expectOne('/api/v1/orders').flush({}, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(page.loading()).toBe(false);
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Unable to load orders');
    expect(fixture.nativeElement.textContent).not.toContain('No orders yet');
    fixture.nativeElement.querySelector('[role="alert"] button').click();
    http.expectOne('/api/v1/orders').flush([row('first')]);
    fixture.detectChanges();
    expect(page.loadError()).toBe('');
    expect(page.orders().length).toBe(1);
  });

  it('cancels an old account request when a new filter is selected', async () => {
    const page = fixture.componentInstance;
    await render();
    const previous = http.expectOne('/api/v1/orders');
    page.selectAccount('second');
    await render();
    expect(previous.cancelled).toBe(true);
    http.expectOne('/api/v1/orders?accountId=second').flush([row('second')]);
    expect(page.orders()[0].accountId).toBe('second');
  });
});
