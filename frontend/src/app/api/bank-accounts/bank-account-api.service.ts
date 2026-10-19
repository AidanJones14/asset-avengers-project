/**
 * Typed boundary to the authenticated banking and portfolio-snapshot endpoints.
 * The server derives ownership from the JWT; displayed cash is restored from SQL,
 * not persisted or settled by this browser service.
 */

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BankAccount } from './bank-account';

export interface Purchase {
  fillId: string;
  acquiredAt: string;
  quantity: number;
  pricePaid: number;
  totalCost: number;
}

export interface TradingAccountSnapshot {
  accountId: string;
  cashBalance: number;
  availableCash: number;
  realizedReturn: number;
  watchedSymbols: string[];
  holdings: { instrumentId: string; symbol: string; name: string; quantity: number; averageCost: number | null; purchases?: Purchase[] }[];
  orders: import('../orders/order').ApiOrder[];
}

export const BANK_ACCOUNT_API_URL = '/api/v1/bank-accounts';

export interface DepositWithdrawalRequest {
  bankAccountId: string;
  amount: number;
}

@Injectable({ providedIn: 'root' })
export class BankAccountApiService {
  constructor(private http: HttpClient) {}

  createBankAccount(
    userId: string,
    bankName: string,
    routingNumber: string,
    accountNumber: string,
    confirmAccountNumber: string
  ): Observable<BankAccount> {
    return this.http.post<BankAccount>(BANK_ACCOUNT_API_URL, {
      bankName,
      routingNumber,
      accountNumber,
      confirmAccountNumber,
    }, {
      params: { userId }
    });
  }

  getUserBankAccounts(userId: string): Observable<BankAccount[]> {
    return this.http.get<BankAccount[]>(BANK_ACCOUNT_API_URL, {
      params: { userId }
    });
  }

  deleteBankAccount(bankAccountId: string, userId: string): Observable<void> {
    return this.http.delete<void>(`${BANK_ACCOUNT_API_URL}/${bankAccountId}`, {
      params: { userId }
    });
  }

  getTradingAccount(): Observable<TradingAccountSnapshot> {
    return this.http.get<TradingAccountSnapshot>(
      `${BANK_ACCOUNT_API_URL}/trading-account`,
    );
  }

  deposit(userId: string, bankAccountId: string, amount: number): Observable<void> {
    return this.http.post<void>(`${BANK_ACCOUNT_API_URL}/deposit`, {
      bankAccountId,
      amount
    }, {
      params: { userId }
    });
  }

  withdraw(userId: string, bankAccountId: string, amount: number): Observable<void> {
    return this.http.post<void>(`${BANK_ACCOUNT_API_URL}/withdraw`, {
      bankAccountId,
      amount
    }, {
      params: { userId }
    });
  }
}
