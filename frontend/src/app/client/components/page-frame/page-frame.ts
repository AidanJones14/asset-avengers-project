import { Component, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { AuthService } from '../../../auth/auth.service';
import { clientProfile } from '../../../auth/client-profile';
import { AccountApiService } from '../../../api/accounts/account-api.service';
import { PortfolioStore } from '../../state/portfolio.store';
import { TradeDialog } from '../trade-dialog/trade-dialog';
@Component({ selector: 'app-page-frame', imports: [TradeDialog], templateUrl: './page-frame.html' })
export class PageFrame {
  readonly page = input.required<'Overview' | 'Portfolio' | 'Orders' | 'Market Watch' | 'Profile' | 'Learn'>();
  readonly notice = signal('');
  readonly dispute = output<void>();
  readonly search = output<void>();
  private readonly auth = inject(AuthService);
  readonly accountApi = inject(AccountApiService);
  readonly portfolioStore = inject(PortfolioStore);
  readonly profile = computed(() => clientProfile(this.auth.claims(), this.auth.email()));
  readonly selectedPortfolioAccount = computed(() =>
    this.accountApi.accounts().find(account => account.accountId === this.portfolioStore.accountId()),
  );
  private readonly dialog = viewChild.required(TradeDialog);
  openTrade(symbol?: string) {
    this.notice.set('');
    this.dialog().openTrade(symbol);
  }

  selectPortfolioAccount(event: Event): void {
    const accountId = (event.target as HTMLSelectElement).value;
    if (accountId) this.portfolioStore.selectAccount(accountId);
  }
}
