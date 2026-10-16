import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { StockSearchService } from './stock-search.service';
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
