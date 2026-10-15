/**
 * Client funding forms call the authenticated banking API and refresh the shared
 * portfolio after success. The app simulates deposits/withdrawals; no bank network
 * is contacted and the browser never decides the final saved cash balance.
 */

import { Component, DestroyRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BankAccountApiService } from '../../../api/bank-accounts/bank-account-api.service';
import { BankAccount } from '../../../api/bank-accounts/bank-account';
import { PortfolioStore } from '../../state/portfolio.store';
import { AuthService } from '../../../auth/auth.service';

@Component({
  selector: 'app-bank-accounts-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="bank-accounts-container">
      <h1>Bank Accounts</h1>

      <div class="content">
        <!-- Add Bank Account Form -->
        <div class="form-section">
          <h2>Add Bank Account</h2>
          <form #form="ngForm" (ngSubmit)="addBankAccount(form)">
            <div class="form-group">
              <label for="bankName">Bank Name</label>
              <input
                id="bankName"
                type="text"
                name="bankName"
                [(ngModel)]="formData.bankName"
                required
                placeholder="e.g., Chase Bank"
              />
            </div>

            <div class="form-group">
              <label for="routingNumber">Routing Number</label>
              <input
                id="routingNumber"
                type="text"
                name="routingNumber"
                [(ngModel)]="formData.routingNumber"
                required
                placeholder="9 digits"
              />
            </div>

            <div class="form-group">
              <label for="accountNumber">Account Number</label>
              <input
                id="accountNumber"
                type="password"
                name="accountNumber"
                [(ngModel)]="formData.accountNumber"
                required
                placeholder="Your account number"
              />
            </div>

            <div class="form-group">
              <label for="confirmAccountNumber">Confirm Account Number</label>
              <input
                id="confirmAccountNumber"
                type="password"
                name="confirmAccountNumber"
                [(ngModel)]="formData.confirmAccountNumber"
                required
                placeholder="Re-enter account number"
              />
            </div>

            @if (error()) {
              <p class="error">{{ error() }}</p>
            }

            <button type="submit" class="primary" [disabled]="loading()">
              {{ loading() ? 'Adding...' : 'Add Bank Account' }}
            </button>
          </form>
        </div>

        <!-- Transaction Buttons Section -->
        <div class="transaction-buttons-section">
          <div class="add-funds-section">
            <h2>Add Funds</h2>
            <p class="section-description">Select a bank account and add funds to increase your cash available to trade</p>
            @if (bankAccounts().length === 0) {
              <p class="empty-state">Add a bank account first to deposit funds.</p>
            } @else {
              <button class="primary add-funds-btn" (click)="openAddFundsDialog()">
                Add Funds to Account
              </button>
            }
          </div>

          <div class="withdraw-funds-section">
            <h2>Withdraw Funds</h2>
            <p class="section-description">Transfer your cash available to trade to one of your bank accounts</p>
            @if (bankAccounts().length === 0) {
              <p class="empty-state">Add a bank account first to withdraw funds.</p>
            } @else if (portfolioStore.cash() === 0) {
              <p class="empty-state">You have no cash available to withdraw.</p>
            } @else {
              <button class="primary withdraw-funds-btn" (click)="openWithdrawFundsDialog()">
                Withdraw Funds
              </button>
            }
          </div>
        </div>

        <!-- Bank Accounts List -->
        <div class="accounts-section">
          <h2>Your Bank Accounts</h2>
          @if (bankAccounts().length === 0) {
            <p class="empty-state">No bank accounts added yet. Add one to get started.</p>
          } @else {
            <div class="accounts-grid">
              @for (account of bankAccounts(); track account.bankAccountId) {
                <div class="account-card">
                  <div class="account-logo">{{ getBankLogo(account.bankName) }}</div>
                  <div class="account-details">
                    <h3>{{ account.bankName }}</h3>
                    <p class="routing">Routing: {{ account.routingNumber }}</p>
                    <p class="account-num">{{ account.maskedAccountNumber }}</p>
                    <p class="created">Added {{ formatDate(account.createdAt) }}</p>
                  </div>
                  <button class="delete-btn" (click)="removeBankAccount(account.bankAccountId)">
                    Delete
                  </button>
                </div>
              }
            </div>
          }
        </div>
      </div>

      <!-- Add Funds Dialog -->
      <dialog #addFundsDialog class="transaction-dialog">
        <div class="dialog-content">
          <h3>Add Funds to Your Account</h3>
          <form #addFundsForm="ngForm" (ngSubmit)="submitAddFunds(addFundsForm)">
            <div class="form-group">
              <label for="bankAccountSelect">Select Bank Account</label>
              <select
                id="bankAccountSelect"
                name="bankAccountSelect"
                [(ngModel)]="transactionData.selectedBankAccountId"
                required
              >
                <option value="" disabled>Choose a bank account...</option>
                @for (account of bankAccounts(); track account.bankAccountId) {
                  <option [value]="account.bankAccountId">
                    {{ account.bankName }} - {{ account.maskedAccountNumber }}
                  </option>
                }
              </select>
            </div>
            <div class="form-group">
              <label for="addAmount">Amount ($)</label>
              <input
                id="addAmount"
                type="number"
                name="addAmount"
                [(ngModel)]="transactionData.amount"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
              />
            </div>
            @if (transactionError()) {
              <p class="error">{{ transactionError() }}</p>
            }
            <div class="dialog-actions">
              <button type="button" class="secondary" (click)="closeAddFundsDialog()">
                Cancel
              </button>
              <button type="submit" class="primary" [disabled]="transactionLoading()">
                {{ transactionLoading() ? 'Processing...' : 'Add Funds' }}
              </button>
            </div>
          </form>
        </div>
      </dialog>

      <!-- Withdraw Funds Dialog -->
      <dialog #withdrawFundsDialog class="transaction-dialog">
        <div class="dialog-content">
          <h3>Withdraw Funds from Your Account</h3>
          <form #withdrawFundsForm="ngForm" (ngSubmit)="submitWithdrawFunds(withdrawFundsForm)">
            <div class="form-group">
              <label for="bankAccountSelectWithdraw">Select Bank Account</label>
              <select
                id="bankAccountSelectWithdraw"
                name="bankAccountSelectWithdraw"
                [(ngModel)]="transactionData.selectedBankAccountId"
                required
              >
                <option value="" disabled>Choose a bank account...</option>
                @for (account of bankAccounts(); track account.bankAccountId) {
                  <option [value]="account.bankAccountId">
                    {{ account.bankName }} - {{ account.maskedAccountNumber }}
                  </option>
                }
              </select>
            </div>
            <div class="form-group">
              <label for="withdrawAmount">Amount ($)</label>
              <input
                id="withdrawAmount"
                type="number"
                name="withdrawAmount"
                [(ngModel)]="transactionData.amount"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
              />
              <p class="available">Available: {{ portfolioStore.cash() | currency }}</p>
            </div>
            @if (transactionError()) {
              <p class="error">{{ transactionError() }}</p>
            }
            <div class="dialog-actions">
              <button type="button" class="secondary" (click)="closeWithdrawFundsDialog()">
                Cancel
              </button>
              <button type="submit" class="primary" [disabled]="transactionLoading()">
                {{ transactionLoading() ? 'Processing...' : 'Withdraw Funds' }}
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </div>
  `,
  styles: [`
    .bank-accounts-container {
      max-width: 900px;
      margin: 0 auto;
      padding: 2rem;
    }

    h1 {
      margin-bottom: 2rem;
      font-size: 1.8rem;
      color: var(--text);
    }

    .content {
      display: grid;
      gap: 3rem;
    }

    .form-section, .accounts-section, .add-funds-section, .withdraw-funds-section {
      background: var(--panel);
      padding: 2rem;
      border-radius: 8px;
      border: 1px solid var(--line);
    }

    h2 {
      margin-bottom: 1.5rem;
      font-size: 1.3rem;
      color: var(--green);
    }

    .form-group {
      margin-bottom: 1rem;
    }

    label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
      color: var(--text);
    }

    input {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid var(--line);
      border-radius: 4px;
      font-size: 1rem;
      background: var(--bg);
      color: var(--text);
    }

    input:focus {
      outline: none;
      border-color: var(--green);
      box-shadow: 0 0 0 2px rgba(179, 245, 104, 0.1);
    }

    select {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid var(--line);
      border-radius: 4px;
      font-size: 1rem;
      background: var(--bg);
      color: var(--text);
      font-family: inherit;
    }

    select:focus {
      outline: none;
      border-color: var(--green);
      box-shadow: 0 0 0 2px rgba(179, 245, 104, 0.1);
    }

    select option {
      background: var(--panel);
      color: var(--text);
    }

    button {
      padding: 0.75rem 1.5rem;
      border: none;
      border-radius: 4px;
      font-size: 1rem;
      cursor: pointer;
      transition: all 0.2s;
      font-weight: 600;
    }

    button.primary {
      background-color: var(--green);
      color: #0c0e10;
      width: 100%;
    }

    button.primary:hover {
      background-color: #a8e85a;
    }

    button.primary:disabled {
      background-color: var(--muted);
      cursor: not-allowed;
      opacity: 0.5;
    }

    .error {
      color: #ec9292;
      margin-bottom: 1rem;
      padding: 0.75rem;
      background: rgba(236, 146, 146, 0.1);
      border-radius: 4px;
      border-left: 3px solid #ec9292;
    }

    .empty-state {
      color: var(--muted);
      text-align: center;
      padding: 2rem;
    }

    .accounts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 1.5rem;
    }

    .account-card {
      background: var(--active);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      position: relative;
    }

    .account-card:hover {
      border-color: var(--green);
      box-shadow: 0 2px 8px rgba(179, 245, 104, 0.2);
    }

    .account-logo {
      width: 50px;
      height: 50px;
      border-radius: 50%;
      background: var(--green);
      color: #0c0e10;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 1.2rem;
      margin-bottom: 1rem;
    }

    .account-details h3 {
      margin: 0 0 0.5rem 0;
      font-size: 1.1rem;
      color: var(--text);
    }

    .account-details p {
      margin: 0.25rem 0;
      font-size: 0.9rem;
      color: var(--muted);
    }

    .routing, .account-num {
      font-family: monospace;
    }

    .created {
      font-size: 0.8rem;
      color: var(--muted);
      margin-top: 0.75rem;
      opacity: 0.8;
    }

    .delete-btn {
      margin-top: 1rem;
      background-color: #ec9292;
      color: #0c0e10;
      padding: 0.5rem 1rem;
      align-self: flex-start;
      width: auto;
    }

    .delete-btn:hover {
      background-color: #da7070;
    }

    .add-funds-section {
      text-align: center;
    }

    .withdraw-funds-section {
      text-align: center;
    }

    .transaction-buttons-section {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2rem;
    }

    @media (max-width: 768px) {
      .transaction-buttons-section {
        grid-template-columns: 1fr;
      }
    }

    .section-description {
      color: var(--muted);
      margin: 1rem 0;
      font-size: 0.95rem;
    }

    .add-funds-btn {
      margin-top: 1rem;
      padding: 0.75rem 2rem;
      font-size: 1rem;
    }

    .withdraw-funds-btn {
      margin-top: 1rem;
      padding: 0.75rem 2rem;
      font-size: 1rem;
      background-color: var(--green);
      color: #0c0e10;
    }

    .withdraw-funds-btn:hover {
      background-color: #a8e85a;
    }

    .transaction-dialog {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 2rem;
      max-width: 400px;
      background: var(--panel);
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
    }

    .transaction-dialog::backdrop {
      background-color: rgba(0, 0, 0, 0.7);
    }

    .dialog-content h3 {
      margin-bottom: 1.5rem;
      font-size: 1.3rem;
      color: var(--green);
    }

    .dialog-actions {
      display: flex;
      gap: 0.75rem;
      margin-top: 1.5rem;
      justify-content: flex-end;
    }

    .dialog-actions button {
      padding: 0.5rem 1.5rem;
      width: auto;
    }

    .secondary {
      background-color: var(--line);
      color: var(--text);
    }

    .secondary:hover {
      background-color: var(--active);
    }

    .available {
      color: var(--muted);
      font-size: 0.85rem;
      margin-top: 0.25rem;
    }
  `]
})
export class BankAccountsPageComponent {
  private readonly bankAccountApi: BankAccountApiService = inject(BankAccountApiService);
  readonly portfolioStore: PortfolioStore = inject(PortfolioStore);
  private readonly destroyRef: DestroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);
  private get TEST_USER_ID() { return this.auth.claims()?.sub ?? ''; }

  bankAccounts = signal<BankAccount[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  usedLogos = signal<Set<string>>(new Set());

  transactionLoading = signal(false);
  transactionError = signal<string | null>(null);
  addFundsDialog: any;
  withdrawFundsDialog: any;

  transactionData = {
    selectedBankAccountId: '',
    amount: 0
  };

  formData = {
    bankName: '',
    routingNumber: '',
    accountNumber: '',
    confirmAccountNumber: ''
  };

  constructor() {
    this.loadBankAccounts(this.TEST_USER_ID);
  }

  loadBankAccounts(userId: string): void {
    this.bankAccountApi.getUserBankAccounts(userId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (accounts: BankAccount[]) => {
          this.bankAccounts.set(accounts);
          this.updateUsedLogos(accounts);
        },
        error: (err: unknown) => this.error.set('Failed to load bank accounts')
      });
  }

  addBankAccount(form: NgForm): void {
    if (form.invalid) return;

    this.loading.set(true);
    this.error.set(null);

    this.bankAccountApi.createBankAccount(
      this.TEST_USER_ID,
      this.formData.bankName,
      this.formData.routingNumber,
      this.formData.accountNumber,
      this.formData.confirmAccountNumber
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (account: BankAccount) => {
          this.bankAccounts.update((accounts) => [account, ...accounts]);
          this.updateUsedLogos(this.bankAccounts());
          this.resetForm();
          this.loading.set(false);
        },
        error: (err: any) => {
          this.error.set(err.error?.message || 'Failed to add bank account');
          this.loading.set(false);
        }
      });
  }

  removeBankAccount(bankAccountId: string): void {
    if (!confirm('Are you sure you want to delete this bank account?')) return;

    this.bankAccountApi.deleteBankAccount(bankAccountId, this.TEST_USER_ID)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.bankAccounts.update((accounts) =>
            accounts.filter((a) => a.bankAccountId !== bankAccountId)
          );
          this.updateUsedLogos(this.bankAccounts());
        },
        error: (err: unknown) => this.error.set('Failed to delete bank account')
      });
  }

  getBankLogo(bankName: string): string {
    // Get first letter
    let logo = bankName.charAt(0).toUpperCase();

    // If first letter already used, use first two letters
    if (this.usedLogos().has(logo) && bankName.length > 1) {
      logo = bankName.substring(0, 2).toUpperCase();
    }

    return logo;
  }

  private updateUsedLogos(accounts: BankAccount[]): void {
    const logos = new Set<string>();
    accounts.forEach((account) => {
      logos.add(this.getBankLogo(account.bankName));
    });
    this.usedLogos.set(logos);
  }

  private resetForm(): void {
    this.formData = {
      bankName: '',
      routingNumber: '',
      accountNumber: '',
      confirmAccountNumber: ''
    };
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString();
  }

  openAddFundsDialog(): void {
    this.transactionData.selectedBankAccountId = '';
    this.transactionData.amount = 0;
    this.transactionError.set(null);
    const dialogs = document.querySelectorAll('dialog.transaction-dialog');
    if (dialogs.length > 0) {
      this.addFundsDialog = dialogs[0] as HTMLDialogElement;
      this.addFundsDialog.showModal();
    }
  }

  closeAddFundsDialog(): void {
    if (this.addFundsDialog instanceof HTMLDialogElement) {
      this.addFundsDialog.close();
    }
  }

  openWithdrawFundsDialog(): void {
    this.transactionData.selectedBankAccountId = '';
    this.transactionData.amount = 0;
    this.transactionError.set(null);
    const dialogs = document.querySelectorAll('dialog.transaction-dialog');
    if (dialogs.length > 1) {
      this.withdrawFundsDialog = dialogs[1] as HTMLDialogElement;
      this.withdrawFundsDialog.showModal();
    }
  }

  closeWithdrawFundsDialog(): void {
    if (this.withdrawFundsDialog instanceof HTMLDialogElement) {
      this.withdrawFundsDialog.close();
    }
  }

  submitAddFunds(form: NgForm): void {
    if (form.invalid || !this.transactionData.selectedBankAccountId || this.transactionData.amount <= 0) {
      return;
    }

    this.transactionLoading.set(true);
    this.transactionError.set(null);
    const depositAmount = this.transactionData.amount;

    this.bankAccountApi.deposit(
      this.TEST_USER_ID,
      this.transactionData.selectedBankAccountId,
      depositAmount
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.transactionLoading.set(false);
          this.portfolioStore.requestRefresh();
          this.closeAddFundsDialog();
          this.transactionData.amount = 0;
          this.transactionData.selectedBankAccountId = '';
        },
        error: (err: any) => {
          this.transactionError.set(err.error?.message || 'Failed to add funds');
          this.transactionLoading.set(false);
        }
      });
  }

  submitWithdrawFunds(form: NgForm): void {
    if (form.invalid || !this.transactionData.selectedBankAccountId || this.transactionData.amount <= 0) {
      return;
    }

    const withdrawAmount = this.transactionData.amount;

    // Check if user has enough cash available to trade
    if (withdrawAmount > this.portfolioStore.cash()) {
      this.transactionError.set('Insufficient cash available for this withdrawal');
      return;
    }

    this.transactionLoading.set(true);
    this.transactionError.set(null);

    this.bankAccountApi.withdraw(
      this.TEST_USER_ID,
      this.transactionData.selectedBankAccountId,
      withdrawAmount
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.transactionLoading.set(false);
          this.portfolioStore.requestRefresh();
          this.closeWithdrawFundsDialog();
          this.transactionData.amount = 0;
          this.transactionData.selectedBankAccountId = '';
        },
        error: (err: any) => {
          this.transactionError.set(err.error?.message || 'Failed to withdraw funds');
          this.transactionLoading.set(false);
        }
      });
  }
}
