import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MarketWatch } from './market-watch';

describe('MarketWatch API integration', () => {
  beforeEach(() => TestBed.configureTestingModule({
    imports: [MarketWatch],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  }));
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('searches backend tickers and watches an instrument without changing holdings', () => {
    const fixture = TestBed.createComponent(MarketWatch);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Loading instruments');
    TestBed.inject(HttpTestingController).expectOne('/instruments').flush([
      { instrumentId: '1', symbol: 'IBM', name: 'International Business Machines',
        securityType: 'equity', exchange: 'NYSE', currency: 'USD', isin: null, active: true },
    ]);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const assets = component.store.assets();
    component.search.set('international');
    fixture.detectChanges();
    expect(component.results().map(item => item.symbol)).toEqual(['IBM']);
    fixture.nativeElement.querySelector('.choice button').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.market-row').textContent).toContain('IBM');
    expect(fixture.nativeElement.querySelector('.market-row').textContent).toContain('Price unavailable');
    expect(component.store.assets()).toBe(assets);
    fixture.nativeElement.querySelector('.market-row button').click();
    fixture.detectChanges();
    expect(component.store.watchedSymbols()).toEqual([]);
    component.search.set('missing');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No matching instruments');
  });

  it('shows a request error and can retry into an empty result', () => {
    const fixture = TestBed.createComponent(MarketWatch);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/instruments').flush({}, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Unable to load');
    fixture.nativeElement.querySelector('.stock-picker > button').click();
    http.expectOne('/instruments').flush([]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No instruments available');
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });
});
