import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PageFrame } from './page-frame';

describe('Orders account filter', () => {
  it('switches the shared account and replaces orders with the selected account snapshot', () => {
    TestBed.configureTestingModule({ imports: [PageFrame],
      providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(PageFrame);
    fixture.componentRef.setInput('page', 'Orders');
    const frame = fixture.componentInstance;
    frame.accountApi.accounts.set(['first', 'second'].map(accountId => ({
      accountId, accountName: accountId, accountType: 'Individual Brokerage', cashBalance: 100,
      suspended: false, deactivated: false, updatedAt: '',
    })));
    frame.portfolioStore.accountId.set('first');
    frame.portfolioStore.orders.set([{ id: 'first-order', accountId: 'first', symbol: 'AAPL',
      side: 'buy', quantity: 1, total: 100, status: 'filled' }]);
    fixture.detectChanges();
    const picker = fixture.nativeElement.querySelector('[aria-label="Filter orders by account"]') as HTMLSelectElement;
    picker.value = 'second';
    picker.dispatchEvent(new Event('change'));
    expect(frame.portfolioStore.orders()).toEqual([]);
    expect(frame.portfolioStore.accountSwitchPending()).toBe(true);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(req => req.url === '/api/v1/bank-accounts/trading-account'
      && req.params.get('accountId') === 'second').flush({
        accountId: 'second', cashBalance: 100, availableCash: 100, holdings: [],
        orders: [{ orderId: 'second-order', accountId: 'second', instrumentId: 'aapl',
          orderSide: 'buy', quantity: 1, price: 100, status: 'filled' }],
      });
    expect(frame.portfolioStore.orders().map(order => order.accountId)).toEqual(['second']);
    expect(frame.portfolioStore.accountSwitchPending()).toBe(false);
    http.verify();
  });
});
