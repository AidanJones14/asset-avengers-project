import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NgForm } from '@angular/forms';
import { StockSearchPage } from './stock-search-page';
import { Instrument } from '../../../api/instruments/instrument';

const instrument: Instrument = { instrumentId: 'goog', symbol: 'GOOG', name: 'Alphabet Inc.',
  securityType: 'equity', currency: 'USD', exchange: 'NASDAQ', isin: null, active: true };

describe('StockSearchPage UI', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [StockSearchPage],
    providers: [provideHttpClient(), provideHttpClientTesting()] }));
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('finds Google by its alias and loads a quote only after selection', () => {
    const fixture = TestBed.createComponent(StockSearchPage);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('app-instrument-search input');
    fixture.componentInstance.portfolioStore.instruments.set([instrument]);
    input.focus();
    input.value = 'Google';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectNone(() => true);
    fixture.nativeElement.querySelector('[role=option]').click();
    http.expectOne('/api/v1/orders/quote/symbol/GOOG').flush({ symbol: 'GOOG', price: 100 });
    expect(fixture.componentInstance.searchResult()?.instrument.symbol).toBe('GOOG');
  });

  it('submits the selected trade using the loaded account', () => {
    const fixture = TestBed.createComponent(StockSearchPage);
    const page = fixture.componentInstance;
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    let closed = false;
    page.tradeDialog().nativeElement.close = () => { closed = true; };
    page.portfolioStore.accountId.set('account-id');
    page.portfolioStore.cash.set(1000);
    page.loadInstrument(instrument);
    http.expectOne('/api/v1/orders/quote/symbol/GOOG').flush({ symbol: 'GOOG', price: 100 });
    page.selectedInstrument.set(instrument);
    page.selectedQuote.set(page.searchResult()!.quote);
    page.submitTrade({ invalid: false } as NgForm);
    const request = http.expectOne('/api/v1/orders');
    expect(request.request.body).toMatchObject({ accountId: 'account-id', symbol: 'GOOG',
      orderSide: 'buy', quantity: 1 });
    request.flush({});
    expect(page.tradeLoading()).toBe(false);
    expect(closed).toBe(true);
  });
});
