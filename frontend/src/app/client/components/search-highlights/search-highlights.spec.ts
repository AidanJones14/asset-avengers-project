import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SearchHighlights } from './search-highlights';

const quoteUrl = '/api/v1/orders/quote/symbol/';

describe('SearchHighlights', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    vi.spyOn(Math, 'random').mockReturnValue(0.2);
    TestBed.configureTestingModule({ imports: [SearchHighlights], providers: [
      provideHttpClient(), provideHttpClientTesting(),
    ] });
  });
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('loads random tickers without consecutive repeats and renders their actual quotes', () => {
    const fixture = TestBed.createComponent(SearchHighlights);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.price')).toBeNull();
    vi.advanceTimersByTime(0);
    const first = http.expectOne(req => req.url.startsWith(quoteUrl));
    expect(first.request.url).toBe(quoteUrl + 'NVDA');
    first.flush({ symbol: 'NVDA', price: 150, currency: 'USD', changePercent: -1.2, asOf: '2026-10-15T12:00:00Z' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.price').textContent).toContain('$150.00');
    expect(fixture.nativeElement.querySelector('.change.down').textContent).toContain('-1.20%');
    expect(fixture.nativeElement.querySelector('.timestamp').textContent).toContain('Oct 15');
    vi.advanceTimersByTime(18000);
    const next = http.expectOne(req => req.url.startsWith(quoteUrl));
    expect(next.request.url).not.toBe(first.request.url);
    next.flush({ symbol: 'GOOG', price: 200, currency: 'USD', changePercent: 1 });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.price').textContent).toContain('$200.00');
    expect(fixture.nativeElement.querySelector('.change.down')).toBeNull();
    http.verify();
    fixture.destroy();
    vi.advanceTimersByTime(18000);
    http.expectNone(() => true);
  });

  it('recovers from failed requests and retains the last successful quote', () => {
    const fixture = TestBed.createComponent(SearchHighlights);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    vi.advanceTimersByTime(0);
    http.expectOne(req => req.url.startsWith(quoteUrl)).flush('Unavailable', { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Quotes temporarily unavailable');
    vi.advanceTimersByTime(18000);
    http.expectOne(req => req.url.startsWith(quoteUrl)).flush({ symbol: 'GOOG', price: 200 });
    expect(fixture.componentInstance.latest()?.price).toBe(200);
    vi.advanceTimersByTime(18000);
    http.expectOne(req => req.url.startsWith(quoteUrl)).flush('Unavailable', { status: 503, statusText: 'Unavailable' });
    expect(fixture.componentInstance.latest()?.price).toBe(200);
    http.verify();
  });

  it('skips requests while paused or hidden and resumes rotation', () => {
    const fixture = TestBed.createComponent(SearchHighlights);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-label')).toBe('Resume highlight rotation');
    vi.advanceTimersByTime(18000);
    http.expectNone(() => true);
    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-label')).toBe('Pause highlight rotation');
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    vi.advanceTimersByTime(18000);
    http.expectNone(() => true);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    vi.advanceTimersByTime(18000);
    http.expectOne(req => req.url.startsWith(quoteUrl)).flush({ symbol: 'NVDA', price: 150 });
    http.verify();
  });
});
