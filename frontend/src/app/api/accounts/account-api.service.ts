import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, shareReplay, tap } from 'rxjs';
import { ClientAccount } from './account';

export interface CreateAccountRequest {
  accountName: string;
  accountType: string;
}

@Injectable({ providedIn: 'root' })
export class AccountApiService {
  private readonly http = inject(HttpClient);
  private readonly url = '/api/v1/me/accounts';
  private accountsRequest$: Observable<ClientAccount[]> | null = null;
  readonly accounts = signal<ClientAccount[]>([]);

  getAccounts(): Observable<ClientAccount[]> {
    this.accountsRequest$ ??= this.http.get<ClientAccount[]>(this.url).pipe(
      tap((accounts) => this.accounts.set(accounts)),
      shareReplay(1),
    );
    return this.accountsRequest$;
  }

  createAccount(request: CreateAccountRequest): Observable<ClientAccount> {
    return this.http.post<ClientAccount>(this.url, request).pipe(
      tap((account) => this.accounts.update((accounts) => [...accounts, account])),
    );
  }

  clear(): void {
    this.accounts.set([]);
    this.accountsRequest$ = null;
  }
}
