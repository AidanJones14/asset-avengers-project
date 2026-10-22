import { Component, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { AuthService } from '../../../auth/auth.service';
import { clientProfile } from '../../../auth/client-profile';
import { TradeDialog } from '../trade-dialog/trade-dialog';
@Component({ selector: 'app-page-frame', imports: [TradeDialog], templateUrl: './page-frame.html' })
export class PageFrame {
  readonly page = input.required<'Overview' | 'Portfolio' | 'Orders' | 'Market Watch' | 'Profile' | 'Learn'>();
  readonly notice = signal('');
  readonly dispute = output<void>();
  private readonly auth = inject(AuthService);
  readonly profile = computed(() => clientProfile(this.auth.claims(), this.auth.email()));
  private readonly dialog = viewChild.required(TradeDialog);
  openTrade(symbol?: string) {
    this.notice.set('');
    this.dialog().openTrade(symbol);
  }
}
