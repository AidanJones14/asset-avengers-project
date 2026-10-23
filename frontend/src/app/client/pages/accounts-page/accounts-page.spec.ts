import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { AccountApiService } from '../../../api/accounts/account-api.service';
import { ClientAccount } from '../../../api/accounts/account';
import { PortfolioStore } from '../../state/portfolio.store';
import { AccountsPage } from './accounts-page';

@Component({ template: '' })
class TestPortfolioPage {}

describe('Account portfolio navigation', () => {
  const accounts = signal<ClientAccount[]>([]);
  const accountId = signal<string | null>('first');
  const selectAccount = vi.fn((id: string) => accountId.set(id));
  const getDeletionEligibility = vi.fn(() => of({
    cashEmpty: true, activeOrdersEmpty: true, holdingsEmpty: true,
  }));
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    accounts.set(['first', 'second'].map(id => ({
      accountId: id, accountName: `${id} account`, accountType: 'Individual Brokerage',
      cashBalance: 0, suspended: false, deactivated: false, updatedAt: '',
    })));
    accountId.set('first');
    selectAccount.mockClear();
    getDeletionEligibility.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'client/accounts', component: AccountsPage },
          { path: 'client/portfolio', component: TestPortfolioPage },
        ]),
        { provide: AccountApiService, useValue: {
          accounts, getAccounts: () => of(accounts()), getDeletionEligibility,
        } },
        { provide: PortfolioStore, useValue: { accountId, selectAccount } },
      ],
    });
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/client/accounts', AccountsPage);
  });

  it('opens the portfolio with the clicked account selected', async () => {
    const links = harness.routeNativeElement!.querySelectorAll<HTMLAnchorElement>('.account-link');
    expect(links[1].getAttribute('href')).toBe('/client/portfolio');
    links[1].click();
    await harness.fixture.whenStable();
    expect(selectAccount).toHaveBeenCalledExactlyOnceWith('second');
    expect(accountId()).toBe('second');
    expect(TestBed.inject(Router).url).toBe('/client/portfolio');
  });

  it('keeps account deletion separate from portfolio navigation', async () => {
    harness.routeNativeElement!.querySelector<HTMLButtonElement>('.delete-button')!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(getDeletionEligibility).toHaveBeenCalledExactlyOnceWith('first');
    expect(selectAccount).not.toHaveBeenCalled();
    expect(TestBed.inject(Router).url).toBe('/client/accounts');
    expect(harness.routeNativeElement!.querySelector('[role="alertdialog"]')).not.toBeNull();
  });

  it('does not offer portfolio links when there are no accounts', async () => {
    accounts.set([]);
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('.account-link')).toBeNull();
    expect(selectAccount).not.toHaveBeenCalled();
  });
});
