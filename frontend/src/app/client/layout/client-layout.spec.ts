import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { Observable } from 'rxjs';
import { ClientLayout } from './client-layout';
import { PortfolioStore } from '../state/portfolio.store';
import { AuthService } from '../../auth/auth.service';

it('starts the portfolio session once and stops both polling subscriptions on destruction', () => {
  let starts = 0;
  let subscriptions = 0;
  let cleanups = 0;
  const polling = new Observable(() => {
    subscriptions++;
    return () => cleanups++;
  });
  TestBed.configureTestingModule({ imports: [ClientLayout], providers: [provideRouter([]),
    { provide: PortfolioStore, useValue: { startSession: () => starts++,
      livePrices: () => polling, liveUpdates: () => polling } },
    { provide: AuthService, useValue: { email: signal('client@example.com'), logout: () => {} } },
  ] });
  const fixture = TestBed.createComponent(ClientLayout);
  fixture.detectChanges();
  expect(starts).toBe(1);
  expect(subscriptions).toBe(2);
  fixture.destroy();
  expect(cleanups).toBe(2);
});
