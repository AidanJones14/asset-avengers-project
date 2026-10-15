import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TradeDialog } from './trade-dialog';
import { Instrument } from '../../../api/instruments/instrument';

const walmart: Instrument = { instrumentId: 'walmart', symbol: 'WMT', name: 'Walmart Inc.',
  securityType: 'equity', exchange: 'NYSE', currency: 'USD', isin: null, active: true };

describe('TradeDialog UI', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [TradeDialog],
    providers: [provideHttpClient(), provideHttpClientTesting()] }));
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('renders one order ticket and finds company names without pricing requests', () => {
    const fixture = TestBed.createComponent(TradeDialog);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('form.order-ticket').length).toBe(1);
    fixture.componentInstance.store.instruments.set([walmart]);
    fixture.componentInstance.openSearch();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('app-instrument-search input');
    input.focus();
    input.value = 'Walmart';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role=option]').textContent).toContain('WMT');
    TestBed.inject(HttpTestingController).expectNone(() => true);
  });

  it('loads a selected instrument quote and keeps it for order review', () => {
    const fixture = TestBed.createComponent(TradeDialog);
    const dialog = fixture.componentInstance;
    dialog.openSearch();
    dialog.loadInstrument(walmart);
    TestBed.inject(HttpTestingController).expectOne('/api/v1/orders/quote/symbol/WMT')
      .flush({ symbol: 'WMT', price: 100 });
    dialog.selectSearchedStock();
    fixture.detectChanges();
    expect(dialog.symbol).toBe('WMT');
    expect(dialog.stage()).toBe('edit');
    expect(dialog.asset.name).toBe('Walmart Inc.');
    expect(fixture.nativeElement.querySelectorAll('form.order-ticket').length).toBe(1);
  });
});
