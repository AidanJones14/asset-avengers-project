import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { PortfolioStore } from './portfolio.store';
import { InstrumentApiService } from '../../api/instruments/instrument-api.service';
import { QuoteApiService } from '../../api/quotes/quote-api.service';
import { of } from 'rxjs';

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
  });

  it('adds and removes selections without changing portfolio positions or cash', () => {
    const value = store.value();
    const assets = store.assets();
    const cash = store.cash();
    store.toggleWatch('NVDA');
    expect(store.watchlist().map(asset => asset.symbol)).toEqual(['NVDA']);
    store.toggleWatch('NVDA');
    expect(store.watchlist()).toEqual([]);
    expect(store.assets()).toBe(assets);
    expect(store.cash()).toBe(cash);
    expect(store.value()).toBe(value);
  });
  it('ignores unknown symbols and keeps watched prices reactive', () => {
    store.toggleWatch('UNKNOWN');
    expect(store.watchedSymbols()).toEqual([]);
    store.toggleWatch('AAPL');
    store.assets.update(assets => assets.map(asset => asset.symbol === 'AAPL' ? { ...asset, price: 250 } : asset));
    expect(store.watchlist()[0].price).toBe(250);
  });
});
