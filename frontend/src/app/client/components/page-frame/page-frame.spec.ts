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
    }).overrideComponent(PageFrame, { set: { imports: [TradeDialogStub, PolishedSelect] } });
    fixture = TestBed.createComponent(PageFrame);
    fixture.componentRef.setInput('page', 'Portfolio');
    fixture.detectChanges();
    select = fixture.nativeElement.querySelector('.portfolio-account-select');
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
});
