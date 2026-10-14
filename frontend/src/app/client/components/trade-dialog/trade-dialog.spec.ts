import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NgForm } from '@angular/forms';
import { TradeDialog } from './trade-dialog';
import { Instrument } from '../../../api/instruments/instrument';

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
});
