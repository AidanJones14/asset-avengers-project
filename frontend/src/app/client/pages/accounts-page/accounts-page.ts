import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { AccountApiService } from '../../../api/accounts/account-api.service';
import { AccountDeletionEligibility } from '../../../api/accounts/account';
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
  readonly accounts = this.accountApi.accounts;
  readonly showForm = signal(false);
  readonly submitted = signal(false);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly saving = signal(false);
  readonly deleting = signal<string | null>(null);
  readonly deleteDialog = signal<{
    accountId: string;
    accountName: string;
    mode: 'confirm' | 'blocked';
    eligibility: AccountDeletionEligibility;
  } | null>(null);
  accountName = '';
  accountType = '';

  constructor() {
    this.accountApi.getAccounts().subscribe({
      next: (accounts) => {
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

  deactivateAccount(accountId: string, accountName: string): void {
    const account = this.accounts().find((candidate) => candidate.accountId === accountId);
    if (!account) return;

    this.accountApi.getDeletionEligibility(accountId).subscribe({
      next: (eligibility) => this.deleteDialog.set({
        accountId,
        accountName,
        mode: eligibility.cashEmpty && eligibility.activeOrdersEmpty && eligibility.holdingsEmpty
          ? 'confirm' : 'blocked',
        eligibility,
      }),
      error: (err: unknown) => this.error.set(errorMessage(err)),
    });
  }

  closeDeleteDialog(): void {
    if (!this.deleting()) this.deleteDialog.set(null);
  }

  confirmDeactivation(): void {
    const deletion = this.deleteDialog();
    if (!deletion || deletion.mode !== 'confirm') return;

    this.deleting.set(deletion.accountId);
    this.error.set('');
    this.accountApi.deactivateAccount(deletion.accountId).subscribe({
      next: () => {
        this.deleting.set(null);
        this.deleteDialog.set(null);
      },
      error: (err: unknown) => {
        this.accountApi.getDeletionEligibility(deletion.accountId).subscribe({
          next: (eligibility) => this.deleteDialog.set({
            ...deletion,
            mode: 'blocked',
            eligibility,
          }),
          error: () => this.error.set(errorMessage(err)),
        });
        this.deleting.set(null);
      },
    });
  }
}
