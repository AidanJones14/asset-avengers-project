import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PortfolioStore } from '../../state/portfolio.store';
import { OverviewPage } from './overview-page';

describe('Overview chart readiness', () => {
  it('waits for both the account and every held asset price', () => {
    const accountId = signal<string | null>(null);
    const holdings = signal([{ price: 0 }]);
    TestBed.configureTestingModule({ providers: [{ provide: PortfolioStore, useValue: { accountId, holdings } }] });
    const page = TestBed.runInInjectionContext(() => new OverviewPage());
    expect(page.performanceReady()).toBe(false);
    accountId.set('account-1');
    expect(page.performanceReady()).toBe(false);
    holdings.set([{ price: 12 }, { price: 0 }]);
    expect(page.performanceReady()).toBe(false);
    holdings.set([{ price: 12 }, { price: 25 }]);
    expect(page.performanceReady()).toBe(true);
    holdings.set([]);
    expect(page.performanceReady()).toBe(true);
  });
});
