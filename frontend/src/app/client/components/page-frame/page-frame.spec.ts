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

  beforeEach(() => {
    selectAccount.mockClear();
    TestBed.configureTestingModule({
      imports: [PageFrame],
      providers: [
        { provide: AuthService, useValue: { claims: signal(null), email: signal('') } },
        { provide: AccountApiService, useValue: {
          accounts: signal([
            { accountId: 'first', accountName: 'First account' },
            { accountId: 'second', accountName: 'Second account' },
          ]),
        } },
        { provide: PortfolioStore, useValue: { accountId: signal('first'), selectAccount } },
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
});
