import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NgForm } from '@angular/forms';
import { BankAccountsPageComponent } from './bank-accounts-page';

describe('Account-specific withdrawals', () => {
  function setup() {
    TestBed.configureTestingModule({ imports: [BankAccountsPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(BankAccountsPageComponent);
    const page = fixture.componentInstance;
    const http = TestBed.inject(HttpTestingController);
    for (const request of http.match(() => true)) request.flush([]);
    page.portfolioStore.accountId.set('first');
    page.portfolioStore.cash.set(1000);
    page.transactionData = { selectedBankAccountId: 'bank', selectedInvestmentAccountId: 'first', amount: 25 };
    return { fixture, page, http };
  }

  it('waits for the chosen balance and sends that account ID, with duplicate-submit protection', () => {
    const { fixture, page, http } = setup();
    page.selectWithdrawalAccount('second');
    page.submitWithdrawFunds({ invalid: false } as NgForm);
    http.expectNone('/api/v1/bank-accounts/withdraw');
    http.expectOne(req => req.url === '/api/v1/bank-accounts/trading-account').flush({
      accountId: 'second', cashBalance: 30, availableCash: 30, holdings: [], orders: [],
    });
    page.submitWithdrawFunds({ invalid: false } as NgForm);
    page.submitWithdrawFunds({ invalid: false } as NgForm);
    const request = http.expectOne(req => req.url === '/api/v1/bank-accounts/withdraw');
    expect(request.request.body).toEqual({ bankAccountId: 'bank', accountId: 'second', amount: 25 });
    request.flush(null);
    http.verify(); fixture.destroy();
  });

  it('checks the chosen account’s available cash and displays backend rejection details', () => {
    const { fixture, page, http } = setup();
    page.portfolioStore.cash.set(10);
    page.submitWithdrawFunds({ invalid: false } as NgForm);
    expect(page.transactionError()).toContain('Insufficient cash');
    http.expectNone(req => req.url === '/api/v1/bank-accounts/withdraw');
    page.transactionData.amount = 5;
    page.submitWithdrawFunds({ invalid: false } as NgForm);
    http.expectOne(req => req.url === '/api/v1/bank-accounts/withdraw').flush({ detail: 'Investment account not found' },
      { status: 404, statusText: 'Not Found' });
    expect(page.transactionError()).toBe('Investment account not found');
    http.verify(); fixture.destroy();
  });
});
