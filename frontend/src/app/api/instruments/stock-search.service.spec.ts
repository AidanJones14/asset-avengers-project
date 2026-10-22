import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { StockSearchService } from './stock-search.service';
import { InstrumentApiService } from './instrument-api.service';
import { QuoteApiService } from '../quotes/quote-api.service';
import { Instrument } from './instrument';

const instrument = (symbol: string, name: string) => ({ symbol, name } as Instrument);

describe('Shared stock search', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] }));
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('handles exact tickers, company aliases and uncached tickers consistently', () => {
    const service = TestBed.inject(StockSearchService);
    const catalogue = [instrument('GOOG', 'Alphabet'), instrument('GOOGL', 'Alphabet')];
    expect(service.resolve(' goog ', catalogue).symbol).toBe('GOOG');
    expect(service.resolve('Google', catalogue).matches).toEqual(catalogue);
    expect(service.resolve(' nvda ', catalogue).symbol).toBe('NVDA');
    expect(service.resolve('Unknown Company', catalogue).error).toContain('No saved company');
    expect(service.resolve('  ', catalogue)).toEqual({ matches: [], symbol: null, error: null });
    TestBed.inject(HttpTestingController).expectNone(() => true);
  });

  it('resolves an instrument before requesting its canonical ticker quote', () => {
    const service = TestBed.inject(StockSearchService);
    const http = TestBed.inject(HttpTestingController);
    let resolved = '';
    service.lookup('brk.b').subscribe(result => resolved = result.instrument.symbol);
    http.expectOne('/api/v1/instruments/BRK.B').flush(instrument('BRK-B', 'Berkshire Hathaway'));
    http.expectOne('/api/v1/orders/quote/symbol/BRK-B').flush({ symbol: 'BRK-B', price: 100 });
    expect(resolved).toBe('BRK-B');
    http.expectNone(request => request.url === '/api/v1/orders');
  });
});

describe('stock search resolution', () => {
  let service: StockSearchService;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [
      { provide: InstrumentApiService, useValue: {} },
      { provide: QuoteApiService, useValue: {} },
    ] });
    service = TestBed.inject(StockSearchService);
  });
  const catalogue = [instrument('CAT', 'Caterpillar'), instrument('PINS', 'Pinterest'),
    instrument('TER', 'Teradyne'), instrument('VOO', 'Vanguard S&P 500 ETF'),
    instrument('VTI', 'Vanguard Total Stock Market ETF')];
  it('resolves TER exactly despite unrelated company-name substrings', () => {
    expect(service.resolve('ter', catalogue).symbol).toBe('TER');
    expect(service.resolve('Teradyne', catalogue).matches).toEqual([catalogue[2]]);
  });
  it('keeps issuer searches ambiguous and falls back for unknown tickers', () => {
    expect(service.resolve('Vanguard', catalogue).matches).toEqual(catalogue.slice(3));
    expect(service.resolve('ZZTEST', catalogue).symbol).toBe('ZZTEST');
    expect(service.resolve('Unknown Company', catalogue).error).toBeTruthy();
  });
});

describe('international and crypto search', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] }));
  it('finds native crypto and India symbols by ticker and name without quote calls', () => {
    const service = TestBed.inject(StockSearchService);
    const catalogue = [instrument('X:BTC-USD', 'Bitcoin'), instrument('INFY.NS', 'Infosys Ltd')];
    expect(service.resolve('x:btc-usd', catalogue).symbol).toBe('X:BTC-USD');
    expect(service.resolve('Bitcoin', catalogue).matches).toEqual([catalogue[0]]);
    expect(service.resolve('INFY.NS', catalogue).symbol).toBe('INFY.NS');
    expect(service.resolve('Infosys', catalogue).matches).toEqual([catalogue[1]]);
    expect(service.resolve('X:ETH-USD', []).symbol).toBe('X:ETH-USD');
    TestBed.inject(HttpTestingController).expectNone(() => true);
  });
});
