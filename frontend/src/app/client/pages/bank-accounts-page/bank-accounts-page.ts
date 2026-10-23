/**
 * Client funding forms call the authenticated banking API and refresh the shared
 * portfolio after success. The app simulates deposits/withdrawals; no bank network
 * is contacted and the browser never decides the final saved cash balance.
 */

import { Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BankAccountApiService } from '../../../api/bank-accounts/bank-account-api.service';
import { BankAccount } from '../../../api/bank-accounts/bank-account';
import { PortfolioStore } from '../../state/portfolio.store';
import { AuthService } from '../../../auth/auth.service';
import { AccountApiService } from '../../../api/accounts/account-api.service';
import { PolishedSelect } from '../../../shared/directives/polished-select';
import { exhaustMap, filter, forkJoin, merge, of, timeout, timer } from 'rxjs';

@Component({
  selector: 'app-bank-accounts-page',
  standalone: true,
  imports: [CommonModule, FormsModule, PolishedSelect],
  template: `
    <div class="content bank-accounts-container">
      <div class="page-heading">
        <div><h1>Bank Accounts</h1>
          <p class="page-subtitle">Manage your linked accounts and move funds into your trading account.</p>
        </div>
      </div>
      <div class="balance-strip">
        <div class="cash-summary">
          <div class="cash-metric">
            <span class="metric-label">AVAILABLE TO TRADE</span>
            <strong aria-live="polite">{{ cashLoading() ? 'Loading…' : cashError() ? 'Unavailable' : (displayedCash() | currency) }}</strong>
            <small>
              @if (selectedCashAccount(); as account) {
                Cash available in this <span class="cash-account-type">{{ account.accountType }}</span>
              } @else {
                Cash available across all investment accounts
              }
            </small>
          </div>
          <select class="cash-account-select" aria-label="Show cash for trading account"
            [ngModel]="cashAccountId()" (ngModelChange)="selectedCashAccountId.set($event)">
            <option value="">All Accounts</option>
            @for (account of investmentAccounts(); track account.accountId) {
              <option [value]="account.accountId">{{ account.accountName }}</option>
            }
          </select>
        </div>
        <div class="linked-total"><span class="metric-label">LINKED BANK ACCOUNTS</span><strong>{{ bankAccounts().length }}</strong>
        </div>
        @if (cashError()) {
          <p class="error" role="alert">{{ cashError() }} <button type="button" (click)="reloadCashBalances()">Retry</button></p>
        }
      </div>
      <div class="banking-grid">
        <!-- Add Bank Account Form -->
        <div class="form-section">
          <div class="section-heading"><span class="section-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="m3 9 9-6 9 6H3ZM5 10v8m7-8v8m7-8v8M3 21h18" /></svg>
          </span><div><p class="kicker">CONNECT AN ACCOUNT</p><h2>Add Bank Account</h2></div></div>
          <p class="section-description">Add your bank details to fund your portfolio.</p>
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
              <p class="error" role="alert">{{ error() }}</p>
            }

            <button type="submit" class="primary" [disabled]="loading()">
              {{ loading() ? 'Adding...' : 'Add Bank Account' }}
            </button>
          </form>
        </div>

        <!-- Transaction Buttons Section -->
        <div class="transaction-buttons-section">
          <div class="add-funds-section">
            <div class="section-heading"><span class="section-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M12 4v13m-5-5 5 5 5-5M4 20h16" /></svg>
            </span><div><p class="kicker">MOVE MONEY IN</p><h2>Add Funds</h2></div></div>
            <p class="section-description">Select an investment account to transfer funds into from one of your linked bank accounts.</p>
            @if (!hasInvestmentAccount()) {
              <p class="empty-state">Create an investment account first to transfer funds into.</p>
            } @else if (bankAccounts().length === 0) {
              <p class="empty-state">Add a bank account first to deposit funds.</p>
            } @else {
              <button class="primary add-funds-btn" (click)="openAddFundsDialog()">
                Add Funds to Account
              </button>
            }
          </div>

          <div class="withdraw-funds-section">
            <div class="section-heading"><span class="section-icon neutral" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M12 17V4m-5 5 5-5 5 5M4 20h16" /></svg>
            </span><div><p class="kicker muted">MOVE MONEY OUT</p><h2>Withdraw Funds</h2></div></div>
            <p class="section-description">Transfer your cash available to trade to one of your bank accounts</p>
            @if (!hasInvestmentAccount()) {
              <p class="empty-state">Create an investment account first to withdraw funds.</p>
            } @else if (bankAccounts().length === 0) {
              <p class="empty-state">Add a bank account first to withdraw funds.</p>
            } @else if (!cashLoading() && !cashError() && totalAvailableCash() === 0) {
              <p class="empty-state">You have no cash available to withdraw.</p>
            } @else {
              <button class="primary withdraw-funds-btn" [disabled]="cashLoading() || !!cashError()" (click)="openWithdrawFundsDialog()">
                Withdraw Funds
              </button>
            }
          </div>
        </div>

        <!-- Bank Accounts List -->
        <div class="accounts-section">
          <div class="accounts-heading"><div><p class="kicker">CONNECTED BANKS</p><h2>Your Bank Accounts</h2></div>
            <span class="count-badge">{{ bankAccounts().length }} linked</span></div>
          @if (bankAccounts().length === 0) {
            <div class="accounts-empty"><span class="empty-icon" aria-hidden="true">＋</span>
              <h3>No bank accounts yet</h3><p>Add your first account using the form above to get started.</p>
            </div>
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
                  <button type="button" class="delete-btn" [attr.aria-label]="'Delete ' + account.bankName + ' bank account'" (click)="removeBankAccount(account.bankAccountId)">
                    Delete
                  </button>
                </div>
              }
            </div>
          }
        </div>
      </div>

      <!-- Add Funds Dialog -->
      <dialog #addFundsDialog class="transaction-dialog" aria-labelledby="add-funds-title">
        <div class="dialog-content">
          <header class="dialog-heading"><div><p class="kicker">TRANSFER</p>
            <h3 id="add-funds-title">Add funds</h3><p>From your bank to your trading account</p></div>
            <button type="button" class="dialog-close" aria-label="Close add funds dialog" (click)="closeAddFundsDialog()">×</button>
          </header>
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
              <label for="investmentAccountSelect">Select Investment Account</label>
              <select
                id="investmentAccountSelect"
                name="investmentAccountSelect"
                [(ngModel)]="transactionData.selectedInvestmentAccountId"
                required
              >
                <option value="" disabled>Choose an investment account...</option>
                @for (account of investmentAccounts(); track account.accountId) {
                  <option [value]="account.accountId">
                    {{ account.accountName }} - {{ account.accountType }}
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
              <p class="error" role="alert">{{ transactionError() }}</p>
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
      <dialog #withdrawFundsDialog class="transaction-dialog" aria-labelledby="withdraw-funds-title">
        <div class="dialog-content">
          <header class="dialog-heading"><div><p class="kicker">TRANSFER</p>
            <h3 id="withdraw-funds-title">Withdraw funds</h3><p>From your trading account to your bank</p></div>
            <button type="button" class="dialog-close" aria-label="Close withdraw funds dialog" (click)="closeWithdrawFundsDialog()">×</button>
          </header>
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
              <label for="investmentAccountSelectWithdraw">Select Investment Account</label>
              <select
                id="investmentAccountSelectWithdraw"
                name="investmentAccountSelectWithdraw"
                [(ngModel)]="transactionData.selectedInvestmentAccountId"
                required
              >
                <option value="" disabled>Choose an investment account...</option>
                @for (account of investmentAccounts(); track account.accountId) {
                  <option [value]="account.accountId">
                    {{ account.accountName }} - {{ account.accountType }}
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
              @if (transactionData.selectedInvestmentAccountId) {
                <p class="available">Available: {{ withdrawalAvailableCash() === null ? 'Unavailable' : (withdrawalAvailableCash() | currency) }}</p>
              }
            </div>
            @if (transactionError()) {
              <p class="error" role="alert">{{ transactionError() }}</p>
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
    .muted { color: var(--muted); }
    .count-badge { display: inline-flex; align-items: center; gap: 7px; padding: 6px 10px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); font-size: 10px; white-space: nowrap; }
    .balance-strip { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 24px; padding: 24px; margin-bottom: 24px; border: 1px solid var(--line); border-radius: 14px; background: radial-gradient(ellipse at top left, #b3f5680b, transparent 65%), var(--panel); }
    .balance-strip > div { display: grid; gap: 5px; }
    .balance-strip > .error { grid-column: 1 / -1; margin: 0; }
    .balance-strip > .cash-summary { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; min-width: 0; }
    .cash-metric { display: grid; gap: 5px; flex: 1 1 160px; min-width: 0; }
    .cash-account-type { color: var(--button-bg); }
    .cash-summary .cash-account-select { flex: 0 1 200px; width: 200px; max-width: 100%; min-height: 36px; padding: 8px 10px; font-size: 12px; }
    .metric-label { font-size: 9px; letter-spacing: 0.1em; font-weight: 600; color: var(--muted); }
    .balance-strip strong { font-size: 28px; line-height: 1.3; letter-spacing: -0.03em; font-weight: 600; color: var(--green); font-variant-numeric: tabular-nums; }
    .balance-strip small { color: var(--muted); font-size: 11px; }
    .linked-total { border-left: 1px solid var(--line); padding-left: 24px; }
    .linked-total strong { color: var(--text); }
    .banking-grid { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 24px; align-items: start; }
    .form-section, .accounts-section, .add-funds-section, .withdraw-funds-section { min-width: 0; padding: 24px; border: 1px solid var(--line); border-radius: 14px; background: var(--panel); box-shadow: 0 8px 24px #0001; }
    .section-heading { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
    .section-icon { display: grid; place-items: center; width: 40px; height: 40px; flex-shrink: 0; border: 1px solid #425536; border-radius: 10px; background: var(--active); color: var(--green); }
    .section-icon.neutral { color: var(--muted); background: var(--bg); border-color: var(--line); }
    .section-icon svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
    h2 { margin: 0; color: var(--text); font-size: 17px; font-weight: 600; letter-spacing: -0.02em; }
    .section-description { margin: 0 0 20px; color: var(--muted); font-size: 12px; line-height: 1.65; }
    .form-group { margin-bottom: 16px; }
    label { display: block; margin: 0 0 8px; font-weight: 500; font-size: 12px; color: var(--text); }
    input, select { width: 100%; min-width: 0; min-height: 44px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 9px; font: inherit; font-size: 13px; background: var(--bg); color: var(--text); }
    input::placeholder { color: #737e80; }
    input:focus, select:focus { outline: 2px solid #688a49; outline-offset: 2px; }
    select option { background: var(--panel); }
    button { min-height: 42px; padding: 10px 16px; border: 1px solid var(--line); border-radius: 9px; font-size: 12px; font-weight: 600; cursor: pointer; }
    button.primary { width: 100%; border-color: var(--green); background: var(--button-bg); color: #16200e; }
    button.primary:hover:not(:disabled) { background: #c8ff89; border-color: #c8ff89; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .error { margin: 0 0 16px; padding: 10px 12px; border: 1px solid #ec92922b; border-radius: 8px; background: #ec92920a; color: var(--down); font-size: 12px; }
    .transaction-buttons-section { display: grid; gap: 20px; }
    .withdraw-funds-section button { border-color: #45503e; background: var(--active); color: var(--green); }
    .withdraw-funds-section button:hover:not(:disabled) { background: var(--hover); }
    .empty-state { margin: 0; padding: 12px; border: 1px dashed var(--line); border-radius: 9px; color: var(--muted); font-size: 12px; line-height: 1.6; }
    .accounts-section { grid-column: 1 / -1; }
    .accounts-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 20px; }
    .accounts-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 14px; }
    .account-card { display: grid; grid-template-columns: 40px 1fr; align-items: start; gap: 12px; padding: 18px; border: 1px solid var(--line); border-radius: 11px; background: var(--bg); }
    .account-logo { display: grid; place-items: center; width: 40px; height: 40px; border: 1px solid #b3f56819; border-radius: 10px; background: var(--active); color: var(--green); font-size: 13px; font-weight: 700; }
    .account-details { min-width: 0; }
    .account-details h3 { margin: 0 0 8px; color: var(--text); font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
    .account-details p { margin: 4px 0; color: var(--muted); font-size: 11px; }
    .routing, .account-num { font-family: ui-monospace, monospace; overflow-wrap: anywhere; }
    .account-details .created { margin-top: 12px; font-size: 10px; }
    .delete-btn { grid-column: 2; justify-self: start; min-height: 30px; padding: 4px 10px; border: 1px solid #ec929226; border-radius: 6px; background: #ec929208; color: var(--down); font-size: 10px; }
    .delete-btn:hover { background: #ec92921a; border-color: #ec92924d; }
    .accounts-empty { padding: 28px 16px; text-align: center; border: 1px dashed var(--line); border-radius: 10px; }
    .empty-icon { display: grid; place-items: center; width: 38px; height: 38px; margin: 0 auto 12px; border: 1px solid var(--line); border-radius: 10px; color: var(--muted); font-size: 20px; }
    .accounts-empty h3 { margin: 0 0 6px; font-size: 14px; font-weight: 500; }
    .accounts-empty p { margin: 0; color: var(--muted); font-size: 12px; }
    .transaction-dialog { width: min(460px, calc(100% - 28px)); max-height: calc(100dvh - 40px); overflow-y: auto; padding: 24px; border: 1px solid var(--line); border-radius: 14px; background: radial-gradient(ellipse at top right, #b3f56809, transparent 65%), var(--panel); color: var(--text); box-shadow: 0 24px 64px #0008; }
    .transaction-dialog::backdrop { background: #050705b8; backdrop-filter: blur(5px); }
    .dialog-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding-bottom: 20px; margin-bottom: 20px; border-bottom: 1px solid var(--line); }
    .dialog-heading h3 { margin: 4px 0 6px; font-size: 22px; font-weight: 600; letter-spacing: -0.02em; }
    .dialog-heading p:not(.kicker) { margin: 0; font-size: 11px; color: var(--muted); }
    .dialog-close { flex-shrink: 0; width: 32px; min-height: 32px; padding: 0; border-radius: 8px; color: var(--muted); background: var(--bg); font-size: 22px; }
    .dialog-actions { display: flex; gap: 10px; margin-top: 20px; }
    .dialog-actions button { flex: 1; width: auto; }
    .secondary { background: var(--bg); color: var(--text); }
    .secondary:hover { background: var(--hover); }
    .available { color: var(--muted); font-size: 11px; margin: 8px 0 0; }
    @media (max-width: 1000px) {
      .banking-grid { grid-template-columns: 1fr; }
      .page-heading { flex-direction: column; align-items: flex-start; gap: 8px; }
      .form-section, .accounts-section, .add-funds-section, .withdraw-funds-section { padding: 20px; }
      .balance-strip { gap: 16px; padding: 20px; }
      .balance-strip strong { font-size: 24px; }
      .linked-total { padding-left: 16px; }
    }
    @media (max-width: 700px) {
      .balance-strip { grid-template-columns: 1fr; }
      .linked-total { padding: 16px 0 0; border-left: 0; border-top: 1px solid var(--line); }
    }
    @media (max-width: 400px) {
      .transaction-dialog { padding: 20px; }
    }
  `]
})
export class BankAccountsPageComponent {
  private readonly bankAccountApi: BankAccountApiService = inject(BankAccountApiService);
  readonly portfolioStore: PortfolioStore = inject(PortfolioStore);
  private readonly destroyRef: DestroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);
  private readonly accountApi = inject(AccountApiService);
  private get TEST_USER_ID() { return this.auth.claims()?.sub ?? ''; }

  bankAccounts = signal<BankAccount[]>([]);
  readonly investmentAccounts = this.accountApi.accounts;
  readonly hasInvestmentAccount = computed(() => this.accountApi.accounts().length > 0);
  readonly selectedCashAccountId = signal('');
  readonly cashAccountId = computed(() =>
    this.investmentAccounts().some(account => account.accountId === this.selectedCashAccountId())
      ? this.selectedCashAccountId() : '');
  readonly selectedCashAccount = computed(() =>
    this.investmentAccounts().find(account => account.accountId === this.cashAccountId()));
  readonly cashLoading = signal(true);
  readonly cashError = signal('');
  private readonly accountsLoading = signal(true);
  private readonly accountsError = signal('');
  private readonly cashRefresh = signal(0);
  private readonly cashBalances = signal<Record<string, number>>({});
  readonly totalAvailableCash = computed(() =>
    Math.round(Object.values(this.cashBalances()).reduce((sum, cash) => sum + cash, 0) * 100) / 100);
  readonly displayedCash = computed(() =>
    this.cashAccountId() ? this.cashBalances()[this.cashAccountId()] : this.totalAvailableCash());
  loading = signal(false);
  error = signal<string | null>(null);
  usedLogos = signal<Set<string>>(new Set());

  transactionLoading = signal(false);
  transactionError = signal<string | null>(null);
  addFundsDialog: any;
  withdrawFundsDialog: any;

  transactionData = {
    selectedBankAccountId: '',
    selectedInvestmentAccountId: '',
    amount: null as number | null
  };

  formData = {
    bankName: '',
    routingNumber: '',
    accountNumber: '',
    confirmAccountNumber: ''
  };

  constructor() {
    this.loadInvestmentAccounts();
    this.loadBankAccounts(this.TEST_USER_ID);
    effect(onCleanup => {
      const accounts = this.investmentAccounts();
      this.cashRefresh();
      this.cashBalances.set({});
      this.cashError.set('');
      this.cashLoading.set(true);
      if (this.accountsLoading()) return;
      if (this.accountsError()) {
        this.cashError.set(this.accountsError());
        this.cashLoading.set(false);
        return;
      }
      if (!accounts.length) {
        this.cashLoading.set(false);
        return;
      }
      const subscription = merge(
        of(0),
        timer(15000, 15000).pipe(filter(() => !document.hidden)),
      ).pipe(
        exhaustMap(() => forkJoin(accounts.map(account =>
          this.bankAccountApi.getTradingAccount(account.accountId).pipe(timeout(15000)),
        ))),
        takeUntilDestroyed(this.destroyRef),
      ).subscribe({
        next: snapshots => {
          this.cashBalances.set(Object.fromEntries(snapshots.map(snapshot => [snapshot.accountId, snapshot.availableCash])));
          this.cashLoading.set(false);
        },
        error: () => {
          this.cashError.set('Could not load available cash for your investment accounts. Please retry.');
          this.cashLoading.set(false);
        },
      });
      onCleanup(() => subscription.unsubscribe());
    });
  }

  private loadInvestmentAccounts(): void {
    this.accountsLoading.set(true);
    this.accountsError.set('');
    this.accountApi.getAccounts().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => this.accountsLoading.set(false),
      error: () => {
        this.accountsError.set('Could not load your investment accounts. Please retry.');
        this.accountsLoading.set(false);
      },
    });
  }

  reloadCashBalances(): void {
    if (this.accountsError()) this.loadInvestmentAccounts();
    else this.cashRefresh.update(version => version + 1);
  }

  withdrawalAvailableCash(): number | null {
    if (this.cashLoading() || this.cashError()) return null;
    return this.cashBalances()[this.transactionData.selectedInvestmentAccountId] ?? null;
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
    if (!this.hasInvestmentAccount()) return;

    this.transactionData.selectedBankAccountId = '';
    this.transactionData.selectedInvestmentAccountId = '';
    this.transactionData.amount = null;
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
    this.transactionData.selectedInvestmentAccountId = '';
    this.transactionData.amount = null;
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
    if (this.transactionLoading()) return;
    if (!this.hasInvestmentAccount() || form.invalid || !this.transactionData.selectedBankAccountId
      || !this.transactionData.selectedInvestmentAccountId || this.transactionData.amount === null
      || this.transactionData.amount <= 0) {
      return;
    }

    this.transactionLoading.set(true);
    this.transactionError.set(null);
    const depositAmount = this.transactionData.amount;

    this.bankAccountApi.deposit(
      this.TEST_USER_ID,
      this.transactionData.selectedBankAccountId,
      this.transactionData.selectedInvestmentAccountId,
      depositAmount
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.transactionLoading.set(false);
          this.portfolioStore.requestRefresh();
          this.reloadCashBalances();
          this.closeAddFundsDialog();
          this.transactionData.amount = null;
          this.transactionData.selectedBankAccountId = '';
          this.transactionData.selectedInvestmentAccountId = '';
        },
        error: (err: any) => {
          this.transactionError.set(err.error?.message || 'Failed to add funds');
          this.transactionLoading.set(false);
        }
      });
  }

  submitWithdrawFunds(form: NgForm): void {
    if (this.transactionLoading()) return;
    if (form.invalid || !this.transactionData.selectedBankAccountId || this.transactionData.amount === null || this.transactionData.amount <= 0) {
      return;
    }

    const withdrawAmount = this.transactionData.amount;
    if (!this.investmentAccounts().some(account => account.accountId === this.transactionData.selectedInvestmentAccountId)) {
      this.transactionError.set('Select an investment account for this withdrawal.');
      return;
    }
    const availableCash = this.withdrawalAvailableCash();
    if (availableCash === null) {
      this.transactionError.set('Could not verify available cash. Reload balances before withdrawing.');
      return;
    }

    // Check if user has enough cash available to trade
    if (withdrawAmount > availableCash) {
      this.transactionError.set('Insufficient cash available for this withdrawal');
      return;
    }

    this.transactionLoading.set(true);
    this.transactionError.set(null);

    this.bankAccountApi.withdraw(
      this.TEST_USER_ID,
      this.transactionData.selectedBankAccountId,
      this.transactionData.selectedInvestmentAccountId,
      withdrawAmount
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.transactionLoading.set(false);
          this.portfolioStore.requestRefresh();
          this.reloadCashBalances();
          this.closeWithdrawFundsDialog();
          this.transactionData.amount = null;
          this.transactionData.selectedBankAccountId = '';
          this.transactionData.selectedInvestmentAccountId = '';
        },
        error: (err: any) => {
          this.transactionError.set(err.error?.message || 'Failed to withdraw funds');
          this.transactionLoading.set(false);
        }
      });
  }
}
