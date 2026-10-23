import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of, Subject, throwError } from 'rxjs';
import { NgForm } from '@angular/forms';
import { ClientAccount } from '../../../api/accounts/account';
import { AccountApiService } from '../../../api/accounts/account-api.service';
import { BankAccountApiService, TradingAccountSnapshot } from '../../../api/bank-accounts/bank-account-api.service';
import { AuthService } from '../../../auth/auth.service';
import { PortfolioStore } from '../../state/portfolio.store';
import { BankAccountsPageComponent } from './bank-accounts-page';

describe('Banking dropdowns', () => {
  const accounts = signal<ClientAccount[]>([]);
  const snapshot = (accountId: string, availableCash: number): TradingAccountSnapshot => ({
    accountId, availableCash, cashBalance: availableCash + 50,
    realizedReturn: 0, holdings: [], orders: [], watchedSymbols: [],
  });
  const getTradingAccount = vi.fn((id?: string): Observable<TradingAccountSnapshot> =>
    of(snapshot(id!, id === 'investment' ? 100 : 40)));
  const getAccounts = vi.fn(() => of(accounts()));
  const withdraw = vi.fn((): Observable<void> => of(undefined));
  const deposit = vi.fn((): Observable<void> => of(undefined));
  const requestRefresh = vi.fn();
  const selectAccount = vi.fn();
  const validForm = { invalid: false } as NgForm;

  beforeEach(() => {
    accounts.set(['investment', 'retirement'].map((id, index) => ({
      accountId: id, accountName: index ? 'Retirement' : 'Investing',
      accountType: index ? 'Roth IRA' : 'Individual Brokerage',
      cashBalance: 999, suspended: false, deactivated: false, updatedAt: '',
    })));
    getAccounts.mockReset().mockImplementation(() => of(accounts()));
    getTradingAccount.mockReset().mockImplementation((id?: string) =>
      of(snapshot(id!, id === 'investment' ? 100 : 40)));
    withdraw.mockReset().mockReturnValue(of(undefined));
    deposit.mockReset().mockReturnValue(of(undefined));
    requestRefresh.mockClear();
    selectAccount.mockClear();
    TestBed.configureTestingModule({
    imports: [BankAccountsPageComponent],
    providers: [
      { provide: AuthService, useValue: { claims: signal({ sub: 'client' }) } },
      { provide: PortfolioStore, useValue: { cash: signal(1000), requestRefresh, selectAccount } },
      { provide: AccountApiService, useValue: {
        accounts, getAccounts,
      } },
      { provide: BankAccountApiService, useValue: {
        getTradingAccount, withdraw, deposit,
        getUserBankAccounts: () => of([{
          bankAccountId: 'bank', bankName: 'Test Bank', routingNumber: '123456789',
          maskedAccountNumber: '****1234', createdAt: '2026-10-23T12:00:00Z',
        }]),
      } },
    ],
    });
  });

  async function setup() {
    const fixture = TestBed.createComponent(BankAccountsPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  it('shares picker behavior across both dialogs and preserves all transfer bindings', async () => {
    const fixture = await setup();
    const selects = fixture.nativeElement.querySelectorAll('dialog select') as NodeListOf<HTMLSelectElement>;
    expect(selects).toHaveLength(4);
    expect(Array.from(selects).every(select => select.validity.valueMissing)).toBe(true);
    for (const select of selects) {
      expect(select.classList.contains('polished-select')).toBe(true);
      expect(select.options[0].disabled).toBe(true);
      select.value = select.id.startsWith('investmentAccountSelect') ? 'investment' : 'bank';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await fixture.whenStable();
      expect(select.validity.valid).toBe(true);
      if (select.id.startsWith('investmentAccountSelect')) {
        expect(fixture.componentInstance.transactionData.selectedInvestmentAccountId).toBe('investment');
      } else {
        expect(fixture.componentInstance.transactionData.selectedBankAccountId).toBe('bank');
      }
    }
  });

  it('defaults to All Accounts and sums available cash, excluding reserved cash', async () => {
    const fixture = await setup();
    const select = fixture.nativeElement.querySelector('.cash-account-select') as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(select.selectedOptions[0].textContent).toBe('All Accounts');
    expect(Array.from(select.options, option => option.textContent)).toEqual(['All Accounts', 'Investing', 'Retirement']);
    expect(select.classList.contains('polished-select')).toBe(true);
    expect(fixture.componentInstance.displayedCash()).toBe(140);
    expect(fixture.nativeElement.querySelector('.cash-metric strong').textContent).toContain('$140.00');
    expect(fixture.nativeElement.querySelector('.cash-metric small').textContent.trim()).toBe('Cash available across all investment accounts');
    expect(fixture.nativeElement.querySelector('.cash-account-type')).toBeNull();
    expect(getTradingAccount.mock.calls.map(([id]) => id)).toEqual(['investment', 'retirement']);
  });

  it('filters cash without changing transfer selections or the shared portfolio account', async () => {
    const fixture = await setup();
    const component = fixture.componentInstance;
    component.transactionData.selectedInvestmentAccountId = 'investment';
    const select = fixture.nativeElement.querySelector('.cash-account-select') as HTMLSelectElement;
    select.value = 'retirement';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();
    expect(component.displayedCash()).toBe(40);
    expect(fixture.nativeElement.querySelector('.cash-metric small').textContent.trim()).toBe('Cash available in this Roth IRA');
    expect(fixture.nativeElement.querySelector('.cash-account-type').textContent).toBe('Roth IRA');
    expect(component.transactionData.selectedInvestmentAccountId).toBe('investment');
    expect(selectAccount).not.toHaveBeenCalled();
    expect(getTradingAccount).toHaveBeenCalledTimes(2);
    select.value = 'investment';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.cash-account-type').textContent).toBe('Individual Brokerage');
    select.value = '';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();
    expect(component.displayedCash()).toBe(140);
    expect(fixture.nativeElement.querySelector('.cash-metric small').textContent.trim()).toBe('Cash available across all investment accounts');
    expect(fixture.nativeElement.querySelector('.cash-account-type')).toBeNull();
  });

  it('handles empty and single-account lists, and resets a removed account filter', async () => {
    accounts.set([]);
    const fixture = await setup();
    expect(fixture.componentInstance.displayedCash()).toBe(0);
    expect(getTradingAccount).not.toHaveBeenCalled();
    accounts.set([{
      accountId: 'investment', accountName: 'Investing', accountType: 'Individual Brokerage',
      cashBalance: 150, suspended: false, deactivated: false, updatedAt: '',
    }]);
    await fixture.whenStable();
    fixture.componentInstance.selectedCashAccountId.set('investment');
    await fixture.whenStable();
    expect(fixture.componentInstance.displayedCash()).toBe(100);
    accounts.set([]);
    await fixture.whenStable();
    expect(fixture.componentInstance.cashAccountId()).toBe('');
    expect(fixture.componentInstance.displayedCash()).toBe(0);
  });

  it('shows an explicit error instead of a partial total and supports retry', async () => {
    getTradingAccount.mockImplementation(id => id === 'retirement'
      ? throwError(() => new Error('Unavailable')) : of(snapshot(id!, 100)));
    const fixture = await setup();
    expect(fixture.componentInstance.cashError()).toContain('Could not load available cash');
    expect(fixture.nativeElement.querySelector('.cash-metric strong').textContent).toBe('Unavailable');
    expect(fixture.nativeElement.querySelector('.withdraw-funds-btn').disabled).toBe(true);
    getTradingAccount.mockImplementation(id => of(snapshot(id!, 25)));
    fixture.componentInstance.reloadCashBalances();
    await fixture.whenStable();
    expect(fixture.componentInstance.cashError()).toBe('');
    expect(fixture.componentInstance.displayedCash()).toBe(50);
  });

  it('reports account-list failures and retries loading the accounts', async () => {
    getAccounts.mockReturnValue(throwError(() => new Error('Unavailable')));
    const fixture = await setup();
    expect(fixture.componentInstance.cashError()).toContain('Could not load your investment accounts');
    expect(getTradingAccount).not.toHaveBeenCalled();
    getAccounts.mockReturnValue(of(accounts()));
    fixture.componentInstance.reloadCashBalances();
    await fixture.whenStable();
    expect(fixture.componentInstance.displayedCash()).toBe(140);
    expect(fixture.componentInstance.cashError()).toBe('');
  });

  it('cancels stale cash requests when the account list changes', async () => {
    const stale = new Subject<TradingAccountSnapshot>();
    getTradingAccount.mockReturnValue(stale);
    const fixture = await setup();
    expect(fixture.componentInstance.cashLoading()).toBe(true);
    getTradingAccount.mockReturnValue(of(snapshot('investment', 55)));
    accounts.update(rows => rows.slice(0, 1));
    await fixture.whenStable();
    stale.next(snapshot('retirement', 9999));
    stale.complete();
    expect(fixture.componentInstance.displayedCash()).toBe(55);
  });

  it('validates withdrawals against the chosen account rather than the total or portfolio cash', async () => {
    const fixture = await setup();
    const component = fixture.componentInstance;
    component.transactionData = { selectedBankAccountId: 'bank', selectedInvestmentAccountId: '', amount: 50 };
    component.submitWithdrawFunds(validForm);
    expect(component.transactionError()).toContain('Select an investment account');
    component.transactionData.selectedInvestmentAccountId = 'retirement';
    component.submitWithdrawFunds(validForm);
    expect(component.transactionError()).toContain('Insufficient cash');
    expect(withdraw).not.toHaveBeenCalled();
    expect(component.withdrawalAvailableCash()).toBe(40);
  });

  it('withdraws from the chosen account, prevents duplicate submits, and refreshes cash afterward', async () => {
    const fixture = await setup();
    const component = fixture.componentInstance;
    const result = new Subject<void>();
    withdraw.mockReturnValue(result);
    component.selectedCashAccountId.set('investment');
    component.transactionData = { selectedBankAccountId: 'bank', selectedInvestmentAccountId: 'retirement', amount: 25 };
    component.submitWithdrawFunds(validForm);
    component.submitWithdrawFunds(validForm);
    expect(withdraw).toHaveBeenCalledExactlyOnceWith('client', 'bank', 'retirement', 25);
    getTradingAccount.mockImplementation(id => of(snapshot(id!, id === 'investment' ? 100 : 15)));
    result.next();
    result.complete();
    await fixture.whenStable();
    expect(requestRefresh).toHaveBeenCalledOnce();
    expect(component.totalAvailableCash()).toBe(115);
    expect(component.displayedCash()).toBe(100);
    expect(component.transactionData.selectedInvestmentAccountId).toBe('');
  });

  it('refreshes displayed balances after a deposit', async () => {
    const fixture = await setup();
    const component = fixture.componentInstance;
    component.transactionData = { selectedBankAccountId: 'bank', selectedInvestmentAccountId: 'retirement', amount: 10 };
    getTradingAccount.mockImplementation(id => of(snapshot(id!, id === 'investment' ? 100 : 50)));
    component.submitAddFunds(validForm);
    await fixture.whenStable();
    expect(deposit).toHaveBeenCalledExactlyOnceWith('client', 'bank', 'retirement', 10);
    expect(component.totalAvailableCash()).toBe(150);
  });

  it('refreshes visible-page cash every 15 seconds and stops when hidden or destroyed', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    let fixture: ComponentFixture<BankAccountsPageComponent> | undefined;
    try {
      fixture = await setup();
      expect(getTradingAccount).toHaveBeenCalledTimes(2);
      getTradingAccount.mockImplementation(id => of(snapshot(id!, 30)));
      await vi.advanceTimersByTimeAsync(14999);
      expect(getTradingAccount).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(getTradingAccount).toHaveBeenCalledTimes(4);
      expect(fixture.componentInstance.displayedCash()).toBe(60);
      hidden.mockReturnValue(true);
      await vi.advanceTimersByTimeAsync(15000);
      expect(getTradingAccount).toHaveBeenCalledTimes(4);
      fixture.destroy();
      hidden.mockReturnValue(false);
      await vi.advanceTimersByTimeAsync(15000);
      expect(getTradingAccount).toHaveBeenCalledTimes(4);
    } finally {
      fixture?.destroy();
      vi.useRealTimers();
      hidden.mockRestore();
    }
  });
});
