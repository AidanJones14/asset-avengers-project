import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NgForm } from '@angular/forms';
import { StockSearchPage } from './stock-search-page';
import { Instrument } from '../../../api/instruments/instrument';

describe('StockSearchPage company selection', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [StockSearchPage],
    providers: [provideHttpClient(), provideHttpClientTesting()] }));
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  it('shows matching share classes without pricing calls, then loads the selected ticker', () => {
    const fixture = TestBed.createComponent(StockSearchPage);
    const page = fixture.componentInstance;
    const http = TestBed.inject(HttpTestingController);
    const companies = ['GOOG', 'GOOGL'].map(symbol => ({ instrumentId: symbol, symbol,
      name: 'Alphabet Inc.', securityType: 'equity', currency: 'USD', exchange: 'NASDAQ',
      isin: null, active: true } as Instrument));
    page.portfolioStore.instruments.set(companies);
    page.searchSymbol = 'Google';
    page.searchStock({ invalid: false } as NgForm);
    fixture.detectChanges();
    expect(page.companyMatches()).toEqual(companies);
    http.expectNone(req => req.url.includes('/quote/'));
    fixture.nativeElement.querySelector('[aria-label="Matching companies"] button').click();
    http.expectOne('/api/v1/instruments/GOOG').flush(companies[0]);
    http.expectOne('/api/v1/orders/quote/symbol/GOOG').flush({ symbol: 'GOOG', price: 100 });
    expect(page.searchResult()?.instrument.symbol).toBe('GOOG');
    expect(page.companyMatches()).toEqual([]);
  });
  it('reports an unknown company name without sending it as a ticker', () => {
    const page = TestBed.createComponent(StockSearchPage).componentInstance;
    page.searchSymbol = 'Unknown Company';
    page.searchStock({ invalid: false } as NgForm);
    expect(page.searchError()).toContain('No saved company');
    TestBed.inject(HttpTestingController).expectNone(req => req.url.includes('/instruments/'));
  });
});
