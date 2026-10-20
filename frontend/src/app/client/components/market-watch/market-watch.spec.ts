import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { By } from '@angular/platform-browser';
import { TradeDialog } from '../trade-dialog/trade-dialog';
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
    component.lookupStock();
    fixture.detectChanges();
    http.expectNone('/api/v1/instruments/INTERNATIONAL');
    fixture.nativeElement.querySelector('.choice-name').click();
    http.expectOne('/api/v1/instruments/IBM').flush(instrument);
    http.expectOne('/api/v1/orders/quote/symbol/IBM').flush(quote);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.selected-stock app-watch-button button').click();
    http.expectOne('/api/v1/me/watchlist/IBM').flush(['IBM']);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.market-row').textContent).toContain('$100.00');
    expect(component.store.assets()).toBe(assets);
    expect(component.store.watchedSymbols()).toEqual(['IBM']);
    expect(fixture.nativeElement.querySelector('.quick-trade')).toBeNull();
    http.expectNone(request => request.url === '/api/v1/orders' && request.method === 'POST');
    fixture.nativeElement.querySelector('.market-row app-watch-button button').click();
    http.expectOne('/api/v1/me/watchlist/IBM').flush([]);
    expect(component.store.watchedSymbols()).toEqual([]);
  });
  it('looks up a ticker outside the catalogue and makes it available to star', () => {
    const { fixture, http, component } = setup();
    component.search.set('tsla');
    component.lookupStock();
    http.expectOne('/api/v1/instruments/TSLA').flush({ ...instrument, symbol: 'TSLA', instrumentId: 'tesla' });
    http.expectOne('/api/v1/orders/quote/symbol/TSLA').flush({ ...quote, symbol: 'TSLA' });
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.selected-stock app-watch-button button').click();
    http.expectOne('/api/v1/me/watchlist/TSLA').flush(['TSLA']);
    fixture.detectChanges();
    expect(component.store.watchedSymbols()).toEqual(['TSLA']);
    expect(fixture.nativeElement.querySelector('.quick-trade')).toBeNull();
    http.expectNone(request => request.url === '/api/v1/orders' && request.method === 'POST');
  });
  it('uses the canonical ticker returned by the shared stock lookup', () => {
    const { http, component } = setup();
    component.search.set('brk.b');
    component.lookupStock();
    http.expectOne('/api/v1/instruments/BRK.B').flush({ ...instrument, symbol: 'BRK-B' });
    http.expectOne('/api/v1/orders/quote/symbol/BRK-B').flush({ ...quote, symbol: 'BRK-B' });
    expect(component.search()).toBe('BRK-B');
  });
  it('reports a quote failure without adding a watchlist item or order', () => {
    const { http, component } = setup();
    component.search.set('tsla');
    component.lookupStock();
    http.expectOne('/api/v1/instruments/TSLA').flush({ ...instrument, symbol: 'TSLA' });
    http.expectOne('/api/v1/orders/quote/symbol/TSLA').flush({}, { status: 502, statusText: 'Bad Gateway' });
    expect(component.searchError()).toBe('Failed to load stock price');
    expect(component.searching()).toBe(false);
    http.expectNone(request => request.method === 'POST' || request.method === 'PUT');
  });
  it('opens the shared trade form from a searched stock and submits an order', () => {
    const { fixture, http, component } = setup();
    component.search.set('IBM'); component.lookupStock();
    http.expectOne('/api/v1/instruments/IBM').flush(instrument);
    http.expectOne('/api/v1/orders/quote/symbol/IBM').flush(quote);
    fixture.detectChanges();
    const dialog = fixture.debugElement.query(By.directive(TradeDialog)).componentInstance as TradeDialog;
    dialog.dialog().nativeElement.showModal = () => {};
    dialog.dialog().nativeElement.close = () => {};
    fixture.nativeElement.querySelector('.search-trade').click();
    expect(dialog.selectedStockInfo()?.instrument.symbol).toBe('IBM');
    expect(dialog.stage()).toBe('edit');
    dialog.quantity = 2; dialog.submit();
    const request = http.expectOne('/api/v1/orders');
    expect(request.request.body).toMatchObject({ accountId: TEST_ACCOUNT_ID, symbol: 'IBM', quantity: 2, orderSide: 'buy' });
    request.flush({ orderId: 'saved', orderSide: 'buy', quantity: 2, price: null, status: 'accepted' });
    expect(component.tradeNotice()).toContain('Order submitted');
  });
  it('cancels an obsolete lookup when the query changes', () => {
    const { http, component } = setup();
    component.search.set('tsla'); component.lookupStock();
    const pending = http.expectOne('/api/v1/instruments/TSLA');
    component.updateSearch('IBM');
    expect(pending.cancelled).toBe(true);
    expect(component.searching()).toBe(false);
    expect(component.selectedStock()).toBeNull();
    expect(component.searchError()).toBe('');
  });
  it('shows a ticker lookup failure without registering an invalid symbol', () => {
    const { http, component } = setup();
    component.search.set('NOPE');
    component.lookupStock();
    http.expectOne('/api/v1/instruments/NOPE').flush({}, { status: 404, statusText: 'Not Found' });
    expect(component.searchError()).toContain('not found');
    expect(component.searching()).toBe(false);
  });
});
