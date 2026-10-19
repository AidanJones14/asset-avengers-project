import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ClientAccount } from './account';

export interface CreateAccountRequest {
  accountName: string;
  accountType: string;
}

@Injectable({ providedIn: 'root' })
export class AccountApiService {
  private readonly http = inject(HttpClient);
  private readonly url = '/api/v1/me/accounts';

  getAccounts(): Observable<ClientAccount[]> {
    return this.http.get<ClientAccount[]>(this.url);
  }

  createAccount(request: CreateAccountRequest): Observable<ClientAccount> {
    return this.http.post<ClientAccount>(this.url, request);
  }
}
