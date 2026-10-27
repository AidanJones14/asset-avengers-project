import { EasternDatePipe } from '../../../shared/pipes/eastern-date.pipe';
import { Component, DestroyRef, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { AuthService } from '../../../auth/auth.service';
import { clientProfile } from '../../../auth/client-profile';
import { AccountApiService } from '../../../api/accounts/account-api.service';
import { PortfolioStore } from '../../state/portfolio.store';
import { TradeDialog } from '../trade-dialog/trade-dialog';
import { PolishedSelect } from '../../../shared/directives/polished-select';
@Component({ selector: 'app-page-frame', imports: [EasternDatePipe, TradeDialog, PolishedSelect], styleUrl: './page-frame.css', templateUrl: './page-frame.html' })
export class PageFrame {
  private readonly now = signal(Date.now());
  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
  suspensionCountdown(at: string | null | undefined): string {
    const seconds = Math.ceil((Date.parse(at || '') - this.now()) / 1000);
    if (!Number.isFinite(seconds)) return 'Suspension time unavailable.';
    if (seconds <= 0) return 'Suspension time reached. Updating account status…';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `Suspension in ${days ? days + 'd ' : ''}${hours}h ${minutes}m ${seconds % 60}s`;
  }
  readonly page = input.required<'Overview' | 'Portfolio' | 'Orders' | 'Market Watch' | 'Profile' | 'Learn'>();
  readonly ordersAccountFilter = input<string>();
  readonly ordersAccountChange = output<string>();
  readonly notice = signal('');
  readonly dispute = output<void>();
  readonly search = output<void>();
  private readonly auth = inject(AuthService);
  readonly accountApi = inject(AccountApiService);
  readonly portfolioStore = inject(PortfolioStore);
  readonly suspensionNotices = computed(() => this.accountApi.accounts().filter(
    account => account.suspended || account.scheduledSuspensionAt,
  ));
  readonly profile = computed(() => clientProfile(this.auth.claims(), this.auth.email()));
  readonly selectedPortfolioAccount = computed(() =>
    this.accountApi.accounts().find(account => account.accountId === this.portfolioStore.accountId()),
  );
  readonly selectedHeadingAccountName = computed(() => {
    const id = this.page() === 'Orders' ? (this.ordersAccountFilter() ?? this.portfolioStore.accountId()) : this.portfolioStore.accountId();
    return this.accountApi.accounts().find(account => account.accountId === id)?.accountName ?? '';
  });
  private readonly dialog = viewChild.required(TradeDialog);
  openTrade(symbol?: string) {
    this.notice.set('');
    this.dialog().openTrade(symbol);
  }

  selectPortfolioAccount(event: Event): void {
    const accountId = (event.target as HTMLSelectElement).value;
    if (this.page() === 'Orders' && this.ordersAccountFilter() !== undefined) {
      this.ordersAccountChange.emit(accountId);
    } else if (accountId) this.portfolioStore.selectAccount(accountId);
  }
}
