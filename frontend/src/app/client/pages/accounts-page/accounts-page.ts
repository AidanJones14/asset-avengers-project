import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { AccountApiService } from '../../../api/accounts/account-api.service';
import { ClientAccount } from '../../../api/accounts/account';
import { errorMessage } from '../../../auth/api-error';

const ACCOUNT_TYPES = [
  'Individual Brokerage',
  'Roth IRA',
  'Traditional IRA',
  'Health Savings Account (HSA)',
  '401(k)',
  '529 College Savings Plan',
];

@Component({
  selector: 'app-accounts-page',
  imports: [FormsModule],
  templateUrl: './accounts-page.html',
  styleUrl: './accounts-page.css',
})
export class AccountsPage {
  private readonly accountApi = inject(AccountApiService);
  readonly accountTypes = ACCOUNT_TYPES;
  readonly accounts = signal<ClientAccount[]>([]);
  readonly showForm = signal(false);
  readonly submitted = signal(false);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly saving = signal(false);
  accountName = '';
  accountType = '';

  constructor() {
    this.accountApi.getAccounts().subscribe({
      next: (accounts) => {
        this.accounts.set(accounts);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(errorMessage(err));
        this.loading.set(false);
      },
    });
  }

  openForm() {
    this.showForm.set(true);
    this.submitted.set(false);
  }

  cancelForm() {
    this.accountName = '';
    this.accountType = '';
    this.showForm.set(false);
    this.submitted.set(false);
  }

  createAccount(form: NgForm) {
    this.submitted.set(true);
    if (form.invalid) {
      form.control.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.accountApi.createAccount({
      accountName: this.accountName.trim(),
      accountType: this.accountType,
    }).subscribe({
      next: (account) => {
        this.accounts.update((accounts) => [...accounts, account]);
        this.accountName = '';
        this.accountType = '';
        this.showForm.set(false);
        this.submitted.set(false);
        this.saving.set(false);
      },
      error: (err: unknown) => {
        this.error.set(errorMessage(err));
        this.saving.set(false);
      },
    });
  }
}
