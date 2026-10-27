import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NgForm } from '@angular/forms';
import { StockSearchPage } from './stock-search-page';
import { Instrument } from '../../../api/instruments/instrument';
import { Quote } from '../../../api/quotes/quote';

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
    http.expectOne('/api/v1/orders/quote/symbol/GOOG?interactive=true').flush({ symbol: 'GOOG', price: 100 });
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
  it('opens the same trade dialog with its already-loaded quote', () => {
    const fixture = TestBed.createComponent(StockSearchPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    const instrument = { instrumentId: 'nvda', symbol: 'NVDA', name: 'NVIDIA' } as Instrument;
    const quote = { symbol: 'NVDA', price: 150 } as Quote;
    page.searchResult.set({ instrument, quote, loading: false, error: null });
    const dialog = page.tradeDialog();
    dialog.dialog().nativeElement.showModal = () => {};
    page.openTradeDialog(instrument);
    fixture.detectChanges();
    expect(dialog.stage()).toBe('edit');
    expect(dialog.selectedStockInfo()?.quote).toBe(quote);
    expect(fixture.nativeElement.querySelectorAll('app-trade-dialog').length).toBe(1);
    // The shared dialog now owns the account selector; the search page adds none.
    const selectors = fixture.nativeElement.querySelectorAll('select');
    expect(selectors.length).toBe(1);
    expect(selectors[0].closest('app-trade-dialog')).toBeTruthy();
    expect(selectors[0].id).toBe('trade-account');
    TestBed.inject(HttpTestingController).expectNone(() => true);
  });

});
