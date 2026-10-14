import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MarketWatch } from './market-watch';
const TEST_ACCOUNT_ID = '20000000-0000-0000-0000-000000000003';

describe('MarketWatch API integration', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [MarketWatch],
      providers: [provideHttpClient(), provideHttpClientTesting()] });
  });
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });
  const instrument = { instrumentId: 'ibm', symbol: 'IBM', name: 'International Business Machines',
    securityType: 'equity', exchange: 'NYSE', currency: 'USD', isin: null, active: true };
  const quote = { symbol: 'IBM', price: 100, changePercent: 1 };
  function setup() {
    const fixture = TestBed.createComponent(MarketWatch);
    const http = TestBed.inject(HttpTestingController);
    fixture.componentInstance.store.startSession();
    http.expectOne(req => req.url === '/api/v1/bank-accounts/trading-account').flush({
      accountId: TEST_ACCOUNT_ID, cashBalance: 1000, availableCash: 1000, holdings: [], orders: [],
    });
    const requests = http.match('/api/v1/instruments');
    requests[0].flush([]);
    requests[1].flush([instrument]);
    fixture.detectChanges();
    return { fixture, http, component: fixture.componentInstance };
  }
  it('bookmarks a catalogue stock, loads its quote and persists the star without adding holdings', () => {
    const { fixture, http, component } = setup();
    const assets = component.store.assets();
    component.search.set('international');
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.choice button').click();
    http.expectOne('/api/v1/me/watchlist/IBM').flush(['IBM']);
    fixture.detectChanges();
    http.expectOne('/api/v1/orders/quote/symbol/IBM').flush(quote);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.market-row').textContent).toContain('$100.00');
    expect(component.store.assets()).toBe(assets);
    expect(component.store.watchedSymbols()).toEqual(['IBM']);
    expect(fixture.nativeElement.querySelector('[aria-label="Sell 1 share of IBM"]').disabled).toBe(true);
    fixture.nativeElement.querySelector('.market-row app-watch-button button').click();
    http.expectOne('/api/v1/me/watchlist/IBM').flush([]);
    expect(component.store.watchedSymbols()).toEqual([]);
  });
  it('looks up a ticker outside the catalogue and makes it available to star', () => {
    const { fixture, http, component } = setup();
    component.search.set('tsla');
    component.lookupStock();
    http.expectOne('/api/v1/orders/quote/symbol/TSLA').flush({ ...quote, symbol: 'TSLA' });
    http.expectOne('/api/v1/instruments/TSLA').flush({ ...instrument, symbol: 'TSLA', instrumentId: 'tesla' });
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.choice button').click();
    http.expectOne('/api/v1/me/watchlist/TSLA').flush(['TSLA']);
    fixture.detectChanges();
    expect(component.store.watchedSymbols()).toEqual(['TSLA']);
    expect(fixture.nativeElement.querySelector('[aria-label="Buy 1 share of TSLA"]')).toBeTruthy();
  });
  it('submits exactly one share to the backend, prevents duplicate clicks and allows selling held shares', () => {
    const { fixture, http, component } = setup();
    component.tradeOne('IBM', 'buy');
    component.tradeOne('IBM', 'buy');
    const request = http.expectOne('/api/v1/orders');
    expect(request.request.body).toEqual({ accountId: TEST_ACCOUNT_ID, symbol: 'IBM', quantity: 1,
      orderType: 'market', orderSide: 'buy', limitPrice: null, stopPrice: null });
    request.flush({ orderId: 'buy', orderSide: 'buy', quantity: 1, price: null, status: 'accepted' });
    expect(component.tradeMessage()).toContain('Buy order for 1 IBM submitted');
    component.store.assets.update(assets => assets.map(asset => asset.symbol === 'IBM' ? { ...asset, shares: 1 } : asset));
    component.tradeOne('IBM', 'sell');
    const sell = http.expectOne('/api/v1/orders');
    expect(sell.request.body.orderSide).toBe('sell');
    expect(sell.request.body.quantity).toBe(1);
    sell.flush({ detail: 'Insufficient available shares' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Insufficient available shares');
    expect(component.pending()).toBe('');
  });
  it('shows a ticker lookup failure without registering an invalid symbol', () => {
    const { http, component } = setup();
    component.search.set('NOPE');
    component.lookupStock();
    http.expectOne('/api/v1/orders/quote/symbol/NOPE').flush({}, { status: 502, statusText: 'Bad Gateway' });
    expect(component.searchError()).toContain('Unable to find pricing');
    expect(component.searching()).toBe(false);
  });
});
