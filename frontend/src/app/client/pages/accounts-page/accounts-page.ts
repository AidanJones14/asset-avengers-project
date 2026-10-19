import { Component, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';

interface ClientAccount {
  id: number;
  name: string;
  type: string;
}

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
  readonly accountTypes = ACCOUNT_TYPES;
  readonly accounts = signal<ClientAccount[]>([]);
  readonly showForm = signal(false);
  readonly submitted = signal(false);
  accountName = '';
  accountType = '';

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

    this.accounts.update((accounts) => [
      ...accounts,
      {
        id: Date.now(),
        name: this.accountName.trim(),
        type: this.accountType,
      },
    ]);
    this.accountName = '';
    this.accountType = '';
    this.showForm.set(false);
    this.submitted.set(false);
  }
}
