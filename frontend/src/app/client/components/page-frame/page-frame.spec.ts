import { EasternDatePipe } from '../../../shared/pipes/eastern-date.pipe';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, output, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AccountApiService } from '../../../api/accounts/account-api.service';
import { AuthService } from '../../../auth/auth.service';
import { PortfolioStore } from '../../state/portfolio.store';
import { PageFrame } from './page-frame';
import { PolishedSelect } from '../../../shared/directives/polished-select';

@Component({ selector: 'app-trade-dialog', template: '' })
class TradeDialogStub {
  readonly filled = output<void>();
}

describe('Portfolio account picker interaction', () => {
  let fixture: ComponentFixture<PageFrame>;
  let select: HTMLSelectElement;
  const selectAccount = vi.fn();
  const accountId = signal<string | null>('first');

  beforeEach(() => {
    vi.useFakeTimers();
    selectAccount.mockClear();
    accountId.set('first');
    TestBed.configureTestingModule({
      imports: [PageFrame],
      providers: [
        { provide: AuthService, useValue: { claims: signal(null), email: signal('') } },
        { provide: AccountApiService, useValue: {
          accounts: signal([
            { accountId: 'first', accountName: 'First account', accountType: 'Individual Brokerage' },
            { accountId: 'second', accountName: 'Second account', accountType: 'Roth IRA' },
          ]),
        } },
        { provide: PortfolioStore, useValue: { accountId, selectAccount } },
      ],
    }).overrideComponent(PageFrame, { set: { imports: [TradeDialogStub, PolishedSelect, EasternDatePipe] } });
    fixture = TestBed.createComponent(PageFrame);
    fixture.componentRef.setInput('page', 'Portfolio');
    fixture.detectChanges();
    select = fixture.nativeElement.querySelector('.portfolio-account-select');
  });

  afterEach(() => { fixture.destroy(); vi.useRealTimers(); });

  it('counts down each second and waits for server confirmation when time expires', () => {
    const api = TestBed.inject(AccountApiService);
    api.accounts.set([{ accountId: 'first', accountName: 'First', accountType: 'Brokerage',
      cashBalance: 0, suspended: false, deactivated: false, updatedAt: '',
      suspensionReason: 'Inactive account', scheduledSuspensionAt: new Date(Date.now() + 5000).toISOString() }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.suspension-countdown').textContent).toContain('0h 0m 5s');
    vi.advanceTimersByTime(1000);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.suspension-countdown').textContent).toContain('0h 0m 4s');
    vi.advanceTimersByTime(4000);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.suspension-countdown').textContent).toContain('Suspension time reached');
    expect(fixture.nativeElement.textContent).not.toContain('Your account is suspended.');
    api.accounts.update(accounts => accounts.map(account => ({ ...account, suspended: true })));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.suspension-countdown')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Your account is suspended.');
  });

  it('shows the suspension reason and replaces the scheduled notice when suspended', () => {
    const api = TestBed.inject(AccountApiService);
    api.accounts.set([{ accountId: 'first', accountName: 'First account', accountType: 'Individual Brokerage',
      cashBalance: 0, suspended: false, deactivated: false, updatedAt: '',
      suspensionReason: 'Inactive account', scheduledSuspensionAt: '2026-12-01T15:30:00Z' }]);
    fixture.detectChanges();
    let notice = fixture.nativeElement.querySelector('.account-suspension-notice');
    expect(notice.textContent).toContain('Your account will be suspended on');
    expect(notice.textContent).toContain('Inactive account');
    api.accounts.update(accounts => accounts.map(account => ({ ...account, suspended: true, scheduledSuspensionAt: null })));
    fixture.detectChanges();
    notice = fixture.nativeElement.querySelector('.account-suspension-notice');
    expect(notice.textContent).toContain('Your account is suspended.');
    expect(notice.textContent).not.toContain('will be suspended');
    api.accounts.update(accounts => accounts.map(account => ({ ...account, suspended: false, suspensionReason: null })));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.account-suspension-notice')).toBeNull();
  });

  it('enables keyboard highlighting without selecting a different account', () => {
    select.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();
    expect(select.classList.contains('keyboard-navigation')).toBe(true);
    expect(select.value).toBe('first');
    expect(selectAccount).not.toHaveBeenCalled();
    select.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(selectAccount).not.toHaveBeenCalled();
  });

  it('gives pointer interaction precedence over the previous keyboard highlight', () => {
    for (const event of ['pointermove', 'pointerdown']) {
      select.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      fixture.detectChanges();
      expect(select.classList.contains('keyboard-navigation')).toBe(true);
      select.options[1].dispatchEvent(new Event(event, { bubbles: true }));
      fixture.detectChanges();
      expect(select.classList.contains('keyboard-navigation')).toBe(false);
    }
    expect(selectAccount).not.toHaveBeenCalled();
  });

  it('switches accounts only when a selection change is confirmed', () => {
    select.value = 'second';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(selectAccount).toHaveBeenCalledExactlyOnceWith('second');
  });

  it('shows the account type in the workspace subtitle instead of a badge', () => {
    const subtitle = fixture.nativeElement.querySelector('.page-subtitle') as HTMLElement;
    expect(subtitle.textContent?.trim()).toBe('Your Individual Brokerage trading workspace');
    expect(subtitle.querySelector('.portfolio-workspace-account')?.textContent).toBe('Individual Brokerage');
    expect(fixture.nativeElement.querySelector('.portfolio-account-type')).toBeNull();
  });

  it('updates the workspace subtitle when the selected account changes', () => {
    accountId.set('second');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.page-subtitle').textContent.trim()).toBe('Your Roth IRA trading workspace');
    expect(fixture.nativeElement.querySelector('.portfolio-workspace-account').textContent).toBe('Roth IRA');
  });

  it('keeps the original subtitle when no selected account is available', () => {
    for (const id of [null, 'unavailable']) {
      accountId.set(id);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.page-subtitle').textContent.trim()).toBe('Your saved trading workspace');
      expect(fixture.nativeElement.querySelector('.portfolio-workspace-account')).toBeNull();
    }
  });

  it('preserves the subtitle on other pages', () => {
    fixture.componentRef.setInput('page', 'Overview');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.portfolio-workspace-account')).toBeNull();
    expect(fixture.nativeElement.querySelector('.page-subtitle').textContent).toContain('across all your investment accounts');
  });

  it('emits controlled Orders filter changes without switching the trade account', () => {
    fixture.componentRef.setInput('page', 'Orders');
    fixture.componentRef.setInput('ordersAccountFilter', 'all');
    const changed = vi.fn();
    fixture.componentInstance.ordersAccountChange.subscribe(changed);
    fixture.detectChanges();
    expect(select.value).toBe('all');
    select.value = 'second';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(changed).toHaveBeenCalledExactlyOnceWith('second');
    expect(selectAccount).not.toHaveBeenCalled();
    expect(accountId()).toBe('first');
  });
});

describe('Orders account filter', () => {
  it('switches the shared account and replaces orders with the selected account snapshot', () => {
    TestBed.configureTestingModule({ imports: [PageFrame],
      providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(PageFrame);
    fixture.componentRef.setInput('page', 'Orders');
    const frame = fixture.componentInstance;
    frame.accountApi.accounts.set(['first', 'second'].map(accountId => ({
      accountId, accountName: accountId, accountType: 'Individual Brokerage', cashBalance: 100,
      suspended: false, deactivated: false, updatedAt: '',
    })));
    frame.portfolioStore.accountId.set('first');
    frame.portfolioStore.orders.set([{ id: 'first-order', accountId: 'first', symbol: 'AAPL',
      side: 'buy', quantity: 1, total: 100, status: 'filled' }]);
    fixture.detectChanges();
    const picker = fixture.nativeElement.querySelector('[aria-label="Filter orders by account"]') as HTMLSelectElement;
    picker.value = 'second';
    picker.dispatchEvent(new Event('change'));
    expect(frame.portfolioStore.orders()).toEqual([]);
    expect(frame.portfolioStore.accountSwitchPending()).toBe(true);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(req => req.url === '/api/v1/bank-accounts/trading-account'
      && req.params.get('accountId') === 'second').flush({
        accountId: 'second', cashBalance: 100, availableCash: 100, holdings: [],
        orders: [{ orderId: 'second-order', accountId: 'second', instrumentId: 'aapl',
          orderSide: 'buy', quantity: 1, price: 100, status: 'filled' }],
      });
    expect(frame.portfolioStore.orders().map(order => order.accountId)).toEqual(['second']);
    expect(frame.portfolioStore.accountSwitchPending()).toBe(false);
    http.verify();
  });
});
