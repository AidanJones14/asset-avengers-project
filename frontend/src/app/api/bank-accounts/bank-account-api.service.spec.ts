import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { BankAccountApiService } from './bank-account-api.service';

describe('BankAccountApiService withdrawals', () => {
  it('sends the explicit source investment account to the backend', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    TestBed.inject(BankAccountApiService).withdraw('client', 'bank', 'investment', 25).subscribe();
    const http = TestBed.inject(HttpTestingController);
    const request = http.expectOne('/api/v1/bank-accounts/withdraw?userId=client');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ bankAccountId: 'bank', accountId: 'investment', amount: 25 });
    request.flush(null);
    http.verify();
  });
});
