import { TestBed } from '@angular/core/testing';
import { HttpTestingController, HttpClientTestingModule } from '@angular/common/http/testing';
import { PortfolioStore } from './portfolio.store';
import { InstrumentApiService } from '../../api/instruments/instrument-api.service';
import { QuoteApiService } from '../../api/quotes/quote-api.service';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
const TEST_ACCOUNT_ID = '20000000-0000-0000-0000-000000000003';

describe('Market watch', () => {
  let store: PortfolioStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        PortfolioStore,
        {
          provide: InstrumentApiService,
          useValue: { getAllInstruments: () => of([]) }
        },
        {
          provide: QuoteApiService,
          useValue: { getQuote: () => of({}) }
        }
      ]
    });
    store = TestBed.inject(PortfolioStore);
    store.startSession();
  });

  it('keeps price warnings until every failed quote recovers and retains the account timestamp on failure', () => {
    const http = TestBed.inject(HttpTestingController);
    let failing = true;
    vi.spyOn(TestBed.inject(QuoteApiService), 'getQuote').mockImplementation(symbol =>
      symbol === 'MSFT' && failing ? throwError(() => new Error('Unavailable')) : of({ price: 100, stale: false } as any));
    http.expectOne('/api/v1/bank-accounts/trading-account').flush({
      accountId: TEST_ACCOUNT_ID, cashBalance: 800, availableCash: 800,
      holdings: ['MSFT','AAPL'].map(symbol => ({ symbol, name: symbol, instrumentId: symbol, quantity: 1 })), orders: [],
    });
    expect(store.pricesError()).toBeTruthy(); // AAPL succeeded after MSFT failed.
    expect(store.lastPricesUpdatedAt()).toBeNull();
    const updated = store.lastPortfolioUpdatedAt();
    expect(updated).not.toBeNull();
    const subscription = store.liveUpdates().subscribe();
    store.requestRefresh();
    http.expectOne('/api/v1/bank-accounts/trading-account').flush({}, { status: 503, statusText: 'Unavailable' });
    expect(store.lastPortfolioUpdatedAt()).toBe(updated);
    expect(store.portfolioError()).toBeTruthy();
    failing = false;
    store.retryUpdates();
    expect(store.pricesError()).toBeNull();
    expect(store.lastPricesUpdatedAt()).not.toBeNull();
    http.expectOne('/api/v1/bank-accounts/trading-account').flush({ accountId: TEST_ACCOUNT_ID, cashBalance: 800, availableCash: 800, holdings: [], orders: [] });
    expect(store.portfolioError()).toBeNull();
    subscription.unsubscribe(); http.verify();
  });

  it('separates delayed provider quotes from refresh failures and resets update timestamps for a new session', () => {
    const http = TestBed.inject(HttpTestingController);
    vi.spyOn(TestBed.inject(QuoteApiService), 'getQuote').mockReturnValue(of({ price: 100, stale: true } as any));
    http.expectOne('/api/v1/bank-accounts/trading-account').flush({ accountId: TEST_ACCOUNT_ID, cashBalance: 800, availableCash: 800,
      holdings: [{symbol:'AAPL', name:'Apple', instrumentId:'apple', quantity:1}], orders:[] });
    expect(store.pricesError()).toBeNull();
    expect(store.delayedPriceSymbols()).toEqual(['AAPL']);
    store.startSession();
    expect(store.delayedPriceSymbols()).toEqual([]);
    expect(store.lastPortfolioUpdatedAt()).toBeNull();
    expect(store.lastPricesUpdatedAt()).toBeNull();
    http.expectOne('/api/v1/bank-accounts/trading-account').flush({}, {status:503,statusText:'Unavailable'});
    expect(store.portfolioError()).toBeTruthy();
    expect(store.lastPortfolioUpdatedAt()).toBeNull();
    http.verify();
  });

  it('restores saved purchase history and average cost on a new session', () => {
    const http = TestBed.inject(HttpTestingController);
    const purchases = [{ fillId: 'first', acquiredAt: '2026-10-14T12:00:00Z',
      quantity: 2, pricePaid: 100, totalCost: 200 }];
    const snapshot = { accountId: TEST_ACCOUNT_ID, cashBalance: 800, availableCash: 800,
      holdings: [{ instrumentId: 'apple', symbol: 'AAPL', name: 'Apple', quantity: 2,
        averageCost: 100, purchases }], orders: [] };
    http.expectOne('/api/v1/bank-accounts/trading-account').flush(snapshot);
    expect(store.holdings()[0].purchases).toEqual(purchases);
    expect(store.holdings()[0].cost).toBe(100);
    store.startSession();
    expect(store.holdings()).toEqual([]);
    http.expectOne('/api/v1/bank-accounts/trading-account').flush(snapshot);
    expect(store.holdings()[0].purchases).toEqual(purchases);
    expect(store.holdings()[0].cost).toBe(100);
    http.verify();
  });

  it('restores buying power from the same account used for deposits and orders', () => {
    const http = TestBed.inject(HttpTestingController);
    const request = http.expectOne(req =>
      req.url === '/api/v1/bank-accounts/trading-account'
);
    request.flush({ accountId: TEST_ACCOUNT_ID, cashBalance: 1250, availableCash: 1250, holdings: [], orders: [] });
    expect(store.cash()).toBe(1250);
    expect(store.validate('AAPL', 'buy', 1)).toBe('');
    http.verify();
  });

  it('updates buying power and holdings after accepted, bought and sold snapshots', () => {
    const http = TestBed.inject(HttpTestingController);
    const url = (req: import('@angular/common/http').HttpRequest<unknown>) =>
      req.url === '/api/v1/bank-accounts/trading-account';
    http.expectOne(url).flush({ accountId: TEST_ACCOUNT_ID, cashBalance: 1000,
      availableCash: 1000, holdings: [], orders: [] });
    const subscription = store.liveUpdates().subscribe();
    const snapshot = (cashBalance: number, availableCash: number, quantity: number) => {
      store.requestRefresh();
      http.expectOne(url).flush({ accountId: TEST_ACCOUNT_ID, cashBalance, availableCash,
        holdings: [{ instrumentId: 'apple', symbol: 'AAPL', name: 'Apple', quantity }], orders: [] });
    };
    snapshot(1000, 800, 0); // Accepted buy reserves cash but does not add shares.
    expect(store.cash()).toBe(800);
    expect(store.holdings()).toHaveLength(0);
    snapshot(800, 800, 2);
    expect(store.holdings().find(asset => asset.symbol === 'AAPL')?.shares).toBe(2);
    snapshot(900, 900, 1);
    expect(store.cash()).toBe(900);
    expect(store.holdings().find(asset => asset.symbol === 'AAPL')?.shares).toBe(1);
    snapshot(1000, 1000, 0);
    expect(store.holdings()).toHaveLength(0);
    store.requestRefresh();
    http.expectOne(url).flush({}, { status: 503, statusText: 'Unavailable' });
    expect(store.cash()).toBe(1000);
    expect(store.portfolioError()).toContain('Retrying');
    snapshot(1100, 1100, 0);
    expect(store.cash()).toBe(1100);
    expect(store.portfolioError()).toBeNull();
    subscription.unsubscribe();
    http.verify();
  });

  it('refreshes portfolio value and return with market prices and preserves realized profit after selling', () => {
    vi.useFakeTimers();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(req => req.url === '/api/v1/bank-accounts/trading-account').flush({
      accountId: TEST_ACCOUNT_ID, cashBalance: 800, availableCash: 700, realizedReturn: 10,
      holdings: [{ symbol: 'AAPL', name: 'Apple', instrumentId: 'apple', quantity: 2, averageCost: 100 }], orders: [],
    });
    let price = 110;
    vi.spyOn(TestBed.inject(QuoteApiService), 'getQuote').mockImplementation(() => of({ price, changePercent: 0 } as any));
    const prices = store.livePrices().subscribe();
    const updates = store.liveUpdates().subscribe();
    try {
      vi.advanceTimersByTime(0);
      expect(store.value()).toBe(1020); // Uses full cash, including the reserved $100.
      expect(store.totalReturn()).toBe(30);
      price = 120;
      vi.advanceTimersByTime(15000);
      expect(store.value()).toBe(1040);
      expect(store.totalReturn()).toBe(50);
      http.expectOne(req => req.url === '/api/v1/bank-accounts/trading-account').flush({
        accountId: TEST_ACCOUNT_ID, cashBalance: 1040, availableCash: 1040, realizedReturn: 50,
        holdings: [{ symbol: 'AAPL', name: 'Apple', instrumentId: 'apple', quantity: 0, averageCost: 0 }], orders: [],
      });
      expect(store.value()).toBe(1040);
      expect(store.totalReturn()).toBe(50);
      http.verify();
    } finally { prices.unsubscribe(); updates.unsubscribe(); vi.useRealTimers(); }
  });

  it('does not apply a previous login response after switching users', () => {
    const http = TestBed.inject(HttpTestingController);
    store.startSession();
    const requests = http.match(req => req.url === '/api/v1/bank-accounts/trading-account');
    expect(requests).toHaveLength(2);
    requests[1].flush({ accountId: 'new-user-account', cashBalance: 500, availableCash: 500,
      holdings: [], orders: [], watchedSymbols: ['IBM'] });
    requests[0].flush({ accountId: 'old-user-account', cashBalance: 100, availableCash: 100,
      holdings: [], orders: [], watchedSymbols: ['AAPL'] });
    expect(store.accountId()).toBe('new-user-account');
    expect(store.cash()).toBe(500);
    expect(store.watchedSymbols()).toEqual(['IBM']);
    http.verify();
  });

  it('saves stars in the backend and restores them from the next account snapshot', () => {
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(req => req.url === '/api/v1/bank-accounts/trading-account').flush({
      accountId: TEST_ACCOUNT_ID, cashBalance: 1000, availableCash: 1000, holdings: [], orders: [], watchedSymbols: ['IBM'],
    });
    expect(store.watchedSymbols()).toEqual(['IBM']);
    store.toggleWatch('AAPL');
    const save = http.expectOne('/api/v1/me/watchlist/AAPL');
    expect(save.request.method).toBe('PUT');
    save.flush(['IBM', 'AAPL']);
    expect(store.watchedSymbols()).toEqual(['IBM', 'AAPL']);
    store.toggleWatch('IBM');
    const remove = http.expectOne('/api/v1/me/watchlist/IBM');
    expect(remove.request.method).toBe('DELETE');
    remove.flush(['AAPL']);
    expect(store.watchedSymbols()).toEqual(['AAPL']);
    expect(store.holdings()).toEqual([]);
    expect(store.cash()).toBe(1000);
    http.verify();
  });
});
