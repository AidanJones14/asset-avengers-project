import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NgForm } from '@angular/forms';
import { TradeDialog } from './trade-dialog';
import { Instrument } from '../../../api/instruments/instrument';
import { Quote } from '../../../api/quotes/quote';

describe('TradeDialog company-name search', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [TradeDialog],
    providers: [provideHttpClient(), provideHttpClientTesting()] }));
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  it('finds Walmart by name and requests WMT after selection', () => {
    const fixture = TestBed.createComponent(TradeDialog);
    const dialog = fixture.componentInstance;
    const http = TestBed.inject(HttpTestingController);
    const walmart = { instrumentId: 'walmart', symbol: 'WMT', name: 'Walmart Inc.',
      securityType: 'equity', exchange: 'NYSE', currency: 'USD', isin: null, active: true } as Instrument;
    dialog.store.instruments.set([walmart]);
    dialog.openSearch();
    dialog.searchSymbol = ' walmart ';
    dialog.searchStock({ invalid: false } as NgForm);
    fixture.detectChanges();
    expect(dialog.companyMatches()).toEqual([walmart]);
    http.expectNone('/api/v1/instruments/WALMART');
    fixture.nativeElement.querySelector('[aria-label="Matching companies"] button').click();
    http.expectOne('/api/v1/instruments/WMT').flush(walmart);
    http.expectOne('/api/v1/orders/quote/symbol/WMT').flush({ symbol: 'WMT', price: 100 });
    dialog.selectSearchedStock();
    expect(dialog.symbol).toBe('WMT');
    expect(dialog.stage()).toBe('edit');
    expect(dialog.asset.name).toBe('Walmart Inc.');
  });
  it('starts a new trade with a search field and no asset dropdown', () => {
    const fixture = TestBed.createComponent(TradeDialog);
    fixture.detectChanges();
    const dialog = fixture.componentInstance;
    dialog.dialog().nativeElement.showModal = () => {};
    dialog.openTrade();
    fixture.detectChanges();
    expect(dialog.stage()).toBe('search');
    expect(fixture.nativeElement.querySelector('#trade-stock-search')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
    TestBed.inject(HttpTestingController).expectNone(() => true);
  });

  it('submits directly from the entry form and prevents duplicate orders', () => {
    const fixture = TestBed.createComponent(TradeDialog);
    fixture.detectChanges();
    const dialog = fixture.componentInstance;
    dialog.dialog().nativeElement.showModal = () => {};
    dialog.dialog().nativeElement.close = () => {};
    const instrument = { instrumentId: 'aapl', symbol: 'AAPL', name: 'Apple Inc.' } as Instrument;
    const quote = { symbol: 'AAPL', price: 100 } as Quote;
    dialog.store.accountId.set('account');
    dialog.store.cash.set(1000);
    dialog.openTrade('AAPL', { instrument, quote });
    dialog.quantity = 2;
    fixture.detectChanges();
    const form = fixture.nativeElement.querySelector('form');
    expect(form.textContent).toContain('Submit buy order');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    dialog.submit();
    const http = TestBed.inject(HttpTestingController);
    const order = http.expectOne('/api/v1/orders');
    expect(order.request.body).toMatchObject({ accountId: 'account', symbol: 'AAPL', quantity: 2, orderSide: 'buy' });
    order.flush({ orderId: 'order', orderSide: 'buy', quantity: 2, price: null, status: 'accepted' });
    expect(dialog.submitting()).toBe(false);
  });

  it('blocks submission while the selected ticker quote is still loading', () => {
    const fixture = TestBed.createComponent(TradeDialog);
    fixture.detectChanges();
    const dialog = fixture.componentInstance;
    dialog.dialog().nativeElement.showModal = () => {};
    dialog.openTrade('AAPL');
    dialog.submit();
    expect(dialog.stage()).toBe('edit');
    expect(dialog.error()).toContain('load its quote');
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/instruments/AAPL').flush({ symbol: 'AAPL', name: 'Apple Inc.' });
    http.expectOne('/api/v1/orders/quote/symbol/AAPL').flush({ symbol: 'AAPL', price: 100 });
  });

  it('reports invalid form fields instead of silently skipping submission', () => {
    const { dialog, http } = openPreselected();
    dialog.submit({ invalid: true } as NgForm);

    expect(dialog.error()).toContain('valid quantity');
    http.expectNone('/api/v1/orders');
  });

  it('preserves cash terminology, timestamp and spread guidance and displays cash rejections', () => {
    const fixture = TestBed.createComponent(TradeDialog);
    fixture.detectChanges();
    const dialog = fixture.componentInstance;
    dialog.dialog().nativeElement.showModal = () => {};
    dialog.store.accountId.set('account'); dialog.store.cash.set(1000);
    dialog.openTrade('AAPL', { instrument: { instrumentId: 'aapl', symbol: 'AAPL', name: 'Apple' } as Instrument,
      quote: { symbol: 'AAPL', price: 100, ask: 100.04, bid: 99.96, asOf: '2026-10-16T14:00:00Z', stale: true } as Quote });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Cash Available to Trade');
    expect(fixture.nativeElement.textContent).toContain('Buys execute at ask');
    expect(fixture.nativeElement.textContent).toContain('Quote as of');
    expect(fixture.nativeElement.textContent).toContain('Provider marked this quote stale');
    dialog.submit();
    TestBed.inject(HttpTestingController).expectOne('/api/v1/orders').flush({ orderId: 'rejected',
      quantity: 1, status: 'rejected', rejectionReason: 'Insufficient available cash' });
    expect(dialog.stage()).toBe('edit');
    expect(dialog.error()).toBe('Insufficient available cash');
    expect(dialog.submitting()).toBe(false);
  });

  function openPreselected(quote: Partial<Quote> = { symbol: 'AAPL', price: 100, ask: 100.04, bid: 99.96 }) {
    const fixture = TestBed.createComponent(TradeDialog);
    fixture.detectChanges();
    const dialog = fixture.componentInstance;
    dialog.dialog().nativeElement.showModal = () => {};
    dialog.dialog().nativeElement.close = () => {};
    dialog.store.accountId.set('account');
    dialog.store.cash.set(1000);
    dialog.openTrade('AAPL', { instrument: { instrumentId: 'aapl', symbol: 'AAPL', name: 'Apple' } as Instrument, quote: quote as Quote });
    return { fixture, dialog, http: TestBed.inject(HttpTestingController) };
  }

  it('checks a limit buy against cash at the limit price and submits only the limit', () => {
    const { fixture, dialog, http } = openPreselected();
    dialog.setOrderType('limit');
    dialog.quantity = 10;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#trade-limit-price')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('#trade-stop-price')).toBeNull();
    dialog.submit();
    expect(dialog.error()).toContain('limit price');
    dialog.limitPrice = 120;
    dialog.submit();
    expect(dialog.error()).toContain('exceeds your cash');
    dialog.limitPrice = 90;
    dialog.submit();
    expect(dialog.stage()).toBe('edit');
    expect(dialog.totalLabel).toBe('Maximum total');
    expect(dialog.orderTotal).toBe(900);
    const order = http.expectOne('/api/v1/orders');
    expect(order.request.body).toMatchObject({ orderType: 'limit', orderSide: 'buy', quantity: 10, limitPrice: 90, stopPrice: null });
    order.flush({ orderId: 'o', orderType: 'limit', orderSide: 'buy', quantity: 10, price: null, limitPrice: 90, stopPrice: null, status: 'accepted' });
    expect(dialog.store.orders()[0]).toMatchObject({ id: 'o', type: 'limit', limitPrice: 90 });
  });

  it('reserves a stop buy at the higher of the ask and stop, and warns when already triggered', () => {
    const { dialog } = openPreselected();
    dialog.setOrderType('stop');
    dialog.stopPrice = 110;
    expect(dialog.estimatedPrice).toBe(110);
    expect(dialog.immediateNotice).toBe('');
    dialog.stopPrice = 95;
    expect(dialog.estimatedPrice).toBe(100.04);
    expect(dialog.immediateNotice).toContain('trigger right away');
  });

  it('validates stop-limit price order per side and submits both prices', () => {
    const { dialog, http } = openPreselected();
    dialog.side = 'sell';
    dialog.store.assets.set([{ symbol: 'AAPL', name: 'Apple', price: 100, change: 0, shares: 5, cost: 80, instrumentId: 'aapl' }]);
    dialog.setOrderType('stop_limit');
    dialog.quantity = 2;
    dialog.stopPrice = 95;
    dialog.limitPrice = 96;
    dialog.submit();
    expect(dialog.error()).toContain('at or below the stop price');
    dialog.limitPrice = 94.5;
    dialog.submit();
    expect(dialog.stage()).toBe('edit');
    expect(dialog.totalLabel).toBe('Minimum proceeds');
    expect(http.expectOne('/api/v1/orders').request.body).toMatchObject(
      { orderType: 'stop_limit', orderSide: 'sell', quantity: 2, limitPrice: 94.5, stopPrice: 95 });
  });

  it('clears prices the selected order type does not use', () => {
    const { dialog } = openPreselected();
    dialog.setOrderType('stop_limit');
    dialog.stopPrice = 101;
    dialog.limitPrice = 102;
    dialog.setOrderType('limit');
    expect(dialog.stopPrice).toBeNull();
    expect(dialog.limitPrice).toBe(102);
    dialog.setOrderType('market');
    expect(dialog.limitPrice).toBeNull();
    expect(dialog.priceError).toBe('');
  });
  it('submits fractional buys and sells through the updated order form', () => {
    const { fixture, dialog, http } = openPreselected();
    dialog.store.assets.set([{ instrumentId: 'aapl', symbol: 'AAPL', name: 'Apple',
      shares: 0.75, price: 100, cost: 100, change: 0 }]);
    for (const side of ['buy', 'sell'] as const) {
      dialog.openTrade('AAPL', { instrument: { instrumentId: 'aapl', symbol: 'AAPL', name: 'Apple' } as Instrument,
        quote: { symbol: 'AAPL', price: 100, ask: 100.04, bid: 99.96 } as Quote });
      dialog.side = side;
      dialog.quantity = 0.125;
      fixture.detectChanges();
      const input = fixture.nativeElement.querySelector('#trade-quantity');
      expect(input.min).toBe('0.0001');
      expect(input.step).toBe('0.0001');
      dialog.submit();
      const request = http.expectOne('/api/v1/orders');
      expect(request.request.body).toMatchObject({ quantity: 0.125, orderSide: side });
      request.flush({ orderId: side, orderSide: side, quantity: 0.125, status: 'accepted' });
    }
    expect(dialog.store.validate('AAPL', 'buy', 0.0003)).toBe('');
    expect(dialog.store.validate('AAPL', 'buy', 0.12345)).toContain('4 decimal places');
    expect(dialog.store.validate('AAPL', 'sell', 0.7501)).toContain('You hold');
  });

});
