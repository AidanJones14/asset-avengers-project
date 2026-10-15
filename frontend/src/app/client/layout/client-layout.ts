/**
 * Owns the signed-in client's polling subscriptions. Destroying this layout stops
 * its account/quote polling; PortfolioStore holds the shared data used by child pages.
 */

import { Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PortfolioStore } from '../state/portfolio.store';
import { AuthService } from '../../auth/auth.service';
import { BrandLogo } from '../../shared/components/brand-logo/brand-logo';
@Component({
  selector: 'app-client-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, BrandLogo],
  templateUrl: './client-layout.html',
  styleUrl: './client-layout.css',
})
export class ClientLayout {
  readonly auth = inject(AuthService);
  readonly collapsed = signal(false);
  readonly mobileOpen = signal(false);

  readonly store = inject(PortfolioStore);

  constructor() {
    this.store.startSession();
    this.store.livePrices().pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe();
    this.store.liveUpdates().pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe();
  }

  closeMobile(focusTarget: HTMLElement) {
    if (!this.mobileOpen()) return;
    this.mobileOpen.set(false);
    focusTarget.focus();
  }
}
