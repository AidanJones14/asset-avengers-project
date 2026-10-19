import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { PortfolioStore } from './client/state/portfolio.store';
import { InstrumentApiService } from './api/instruments/instrument-api.service';
import { AuthService } from './auth/auth.service';
import { NEVER, of } from 'rxjs';

describe('Saved client workspace', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [
    provideRouter(routes), provideHttpClient(), provideHttpClientTesting(),
    { provide: AuthService, useValue: { isLoggedIn: signal(true), mfaChallenge: signal(null), roles: signal(['CLIENT']),
      email: signal('client@example.com'), fullName: signal('Cameron Kelly'), claims: signal(null), logout: () => undefined } },
    { provide: InstrumentApiService, useValue: { getAllInstruments: () => of([]) } },
    { provide: PortfolioStore, useValue: {
      startSession: () => undefined, liveUpdates: () => NEVER, livePrices: () => NEVER,
      requestRefresh: () => undefined, assets: signal([]), instruments: signal([]), watchedSymbols: signal([]),
      holdings: signal([]), orders: signal([]), cash: signal(0), cashBalance: signal(0),
      value: signal(0), totalReturn: signal(0), accountId: signal('account'), isWatched: () => false,
    } },
  ] }));
  it('starts without invented holdings or performance history', async () => {
    const harness = await RouterTestingHarness.create('/client/overview');
    const text = harness.routeNativeElement!.textContent!;
    expect(text).toContain('No holdings yet');
    expect(text).toContain('Your watchlist is empty');
    expect(text).not.toContain('Joanna');
    expect(text).not.toContain('Sample data');
    expect(text).not.toContain('Illustrative history');
  });
  it('keeps client navigation off the login screen', async () => {
    const harness = await RouterTestingHarness.create('/client/portfolio');
    expect(harness.routeNativeElement?.querySelector('nav')).toBeTruthy();
    await harness.navigateByUrl('/login');
    expect(harness.routeNativeElement?.querySelector('nav')).toBeNull();
    expect(harness.routeNativeElement?.querySelector('[aria-roledescription="carousel"]')).toBeTruthy();
    expect(harness.routeNativeElement?.textContent).toContain('Illustrative data');
  });
});
