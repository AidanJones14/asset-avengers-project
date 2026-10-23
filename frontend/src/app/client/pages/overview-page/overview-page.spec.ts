import { AccountApiService } from '../../../api/accounts/account-api.service';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PortfolioStore } from '../../state/portfolio.store';
import { OverviewPage } from './overview-page';

describe('Overview chart readiness', () => {
  it('waits for both the account and every held asset price', () => {
    const accounts = signal<{ accountId: string }[]>([]);
    const aggregateLoading = signal(false);
    const holdings = signal([{ price: 0 }]);
    TestBed.configureTestingModule({ providers: [
      { provide: AccountApiService, useValue: { accounts } },
      { provide: PortfolioStore, useValue: { aggregateHoldings: holdings, aggregateLoading } },
    ] });
    const page = TestBed.runInInjectionContext(() => new OverviewPage());
    expect(page.performanceReady()).toBe(false);
    accounts.set([{ accountId: 'account-1' }]);
    expect(page.performanceReady()).toBe(false);
    holdings.set([{ price: 12 }, { price: 0 }]);
    expect(page.performanceReady()).toBe(false);
    holdings.set([{ price: 12 }, { price: 25 }]);
    expect(page.performanceReady()).toBe(true);
    aggregateLoading.set(true);
    expect(page.performanceReady()).toBe(false);
    aggregateLoading.set(false);
    holdings.set([]);
    expect(page.performanceReady()).toBe(true);
    accounts.set([]);
    expect(page.performanceReady()).toBe(false);
  });
});
