/**
 * Owns the signed-in client's polling subscriptions. Destroying this layout stops
 * its account/quote polling; PortfolioStore holds the shared data used by child pages.
 */

import { Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PortfolioStore } from '../state/portfolio.store';
import { clientProfile } from '../../auth/client-profile';
import { AuthService } from '../../auth/auth.service';
import { BrandLogo } from '../../shared/components/brand-logo/brand-logo';
import { AccountApiService } from '../../api/accounts/account-api.service';
@Component({
  selector: 'app-client-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, BrandLogo],
  templateUrl: './client-layout.html',
  styleUrl: './client-layout.css',
})
export class ClientLayout {
  readonly auth = inject(AuthService);
  readonly profile = computed(() => clientProfile(this.auth.claims(), this.auth.email()));
  readonly collapsed = signal(false);
  readonly mobileOpen = signal(false);

  readonly store = inject(PortfolioStore);
  private readonly accountApi = inject(AccountApiService);
  private readonly destroyRef = inject(DestroyRef);
  readonly hasInvestmentAccount = computed(() => this.accountApi.accounts().length > 0);
  private sessionStarted = false;

  constructor() {
    this.accountApi.getAccounts().subscribe();
    effect(() => {
      if (this.hasInvestmentAccount() && !this.sessionStarted) {
        this.sessionStarted = true;
        this.store.startSession();
        this.store.livePrices().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
        this.store.liveUpdates().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
      }
    });
  }

  closeMobile(focusTarget: HTMLElement) {
    if (!this.mobileOpen()) return;
    this.mobileOpen.set(false);
    focusTarget.focus();
  }
}
