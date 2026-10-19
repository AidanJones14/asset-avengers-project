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

  it('requires review and submits a preselected quote only once', () => {
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
    dialog.confirm();
    const http = TestBed.inject(HttpTestingController);
    http.expectNone('/api/v1/orders');
    dialog.review();
    expect(dialog.stage()).toBe('review');
    dialog.confirm();
    dialog.confirm();
    const order = http.expectOne('/api/v1/orders');
    expect(order.request.body).toMatchObject({ accountId: 'account', symbol: 'AAPL', quantity: 2, orderSide: 'buy' });
    order.flush({ orderId: 'order', orderSide: 'buy', quantity: 2, price: null, status: 'accepted' });
    expect(dialog.submitting()).toBe(false);
  });

  it('blocks review while the selected ticker quote is still loading', () => {
    const fixture = TestBed.createComponent(TradeDialog);
    fixture.detectChanges();
    const dialog = fixture.componentInstance;
    dialog.dialog().nativeElement.showModal = () => {};
    dialog.openTrade('AAPL');
    dialog.review();
    expect(dialog.stage()).toBe('edit');
    expect(dialog.error()).toContain('load its quote');
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/instruments/AAPL').flush({ symbol: 'AAPL', name: 'Apple Inc.' });
    http.expectOne('/api/v1/orders/quote/symbol/AAPL').flush({ symbol: 'AAPL', price: 100 });
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
    dialog.review(); dialog.confirm();
    TestBed.inject(HttpTestingController).expectOne('/api/v1/orders').flush({ orderId: 'rejected',
      quantity: 1, status: 'rejected', rejectionReason: 'Insufficient available cash' });
    expect(dialog.stage()).toBe('review');
    expect(dialog.error()).toBe('Insufficient available cash');
    expect(dialog.submitting()).toBe(false);
  });

});
