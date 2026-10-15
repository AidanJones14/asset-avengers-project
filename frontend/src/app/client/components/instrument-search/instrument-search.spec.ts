import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { InstrumentSearch } from './instrument-search';
import { PortfolioStore } from '../../state/portfolio.store';
import { Instrument } from '../../../api/instruments/instrument';

const instrument = (symbol: string): Instrument => ({ instrumentId: symbol, symbol,
  name: 'Alphabet Inc.', securityType: 'equity', exchange: 'NASDAQ', currency: 'USD', isin: null, active: true });

describe('InstrumentSearch', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [InstrumentSearch], providers: [
    provideHttpClient(), provideHttpClientTesting(),
    { provide: PortfolioStore, useValue: { instruments: signal([instrument('GOOG'), instrument('GOOGL')]) } },
  ] }));
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('matches company aliases and supports keyboard selection without HTTP', () => {
    const fixture = TestBed.createComponent(InstrumentSearch);
    const search = fixture.componentInstance;
    let selected = '';
    search.selected.subscribe(value => selected = value.symbol);
    search.showSuggestions();
    search.search('Google');
    expect(search.results().map(value => value.symbol)).toEqual(['GOOG', 'GOOGL']);
    search.handleKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    search.handleKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(selected).toBe('GOOG');
    expect(search.open()).toBe(false);
    TestBed.inject(HttpTestingController).expectNone(() => true);
  });

  it('looks up an uncached ticker through the existing endpoint', async () => {
    const search = TestBed.createComponent(InstrumentSearch).componentInstance;
    search.showSuggestions();
    search.search('wmt');
    await new Promise(resolve => setTimeout(resolve, 300));
    TestBed.inject(HttpTestingController).expectOne('/api/v1/instruments/WMT').flush(instrument('WMT'));
    expect(search.results()[0].symbol).toBe('WMT');
    expect(search.loading()).toBe(false);
  });

  it('does not send multiword company names to ticker lookup', () => {
    const search = TestBed.createComponent(InstrumentSearch).componentInstance;
    search.search('Unknown Company');
    expect(search.error()).toContain('No saved company');
    TestBed.inject(HttpTestingController).expectNone(() => true);
  });

  it('cancels an obsolete ticker lookup and reports errors for the current query', async () => {
    const search = TestBed.createComponent(InstrumentSearch).componentInstance;
    const http = TestBed.inject(HttpTestingController);
    search.search('wmt');
    await new Promise(resolve => setTimeout(resolve, 300));
    const obsolete = http.expectOne('/api/v1/instruments/WMT');
    search.search('missing');
    expect(obsolete.cancelled).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 300));
    http.expectOne('/api/v1/instruments/MISSING').flush({}, { status: 404, statusText: 'Not Found' });
    expect(search.error()).toContain('not found');
    expect(search.loading()).toBe(false);
    expect(search.results()).toEqual([]);
  });
});
