import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AccountApiService } from '../../../api/accounts/account-api.service';
import { BankAccountApiService } from '../../../api/bank-accounts/bank-account-api.service';
import { AuthService } from '../../../auth/auth.service';
import { PortfolioStore } from '../../state/portfolio.store';
import { BankAccountsPageComponent } from './bank-accounts-page';

describe('Banking dropdowns', () => {
  beforeEach(() => TestBed.configureTestingModule({
    imports: [BankAccountsPageComponent],
    providers: [
      { provide: AuthService, useValue: { claims: signal({ sub: 'client' }) } },
      { provide: PortfolioStore, useValue: { cash: signal(100) } },
      { provide: AccountApiService, useValue: {
        accounts: signal([{ accountId: 'investment', accountName: 'Retirement', accountType: 'Roth IRA' }]),
        getAccounts: () => of([]),
      } },
      { provide: BankAccountApiService, useValue: {
        getUserBankAccounts: () => of([{
          bankAccountId: 'bank', bankName: 'Test Bank', routingNumber: '123456789',
          maskedAccountNumber: '****1234', createdAt: '2026-10-23T12:00:00Z',
        }]),
      } },
    ],
  }));

  it('shares picker behavior across both dialogs and preserves all transfer bindings', async () => {
    const fixture = TestBed.createComponent(BankAccountsPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const selects = fixture.nativeElement.querySelectorAll('select') as NodeListOf<HTMLSelectElement>;
    expect(selects).toHaveLength(3);
    expect(Array.from(selects).every(select => select.validity.valueMissing)).toBe(true);
    for (const select of selects) {
      expect(select.classList.contains('polished-select')).toBe(true);
      expect(select.options[0].disabled).toBe(true);
      select.value = select.id === 'investmentAccountSelect' ? 'investment' : 'bank';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await fixture.whenStable();
      expect(select.validity.valid).toBe(true);
      if (select.id === 'investmentAccountSelect') {
        expect(fixture.componentInstance.transactionData.selectedInvestmentAccountId).toBe('investment');
      } else {
        expect(fixture.componentInstance.transactionData.selectedBankAccountId).toBe('bank');
      }
    }
  });
});
