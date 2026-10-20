/**
 * Owns the signed-in client's polling subscriptions. Destroying this layout stops
 * its account/quote polling; PortfolioStore holds the shared data used by child pages.
 */

import { DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { Router, NavigationEnd, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PortfolioStore } from '../state/portfolio.store';
import { clientProfile } from '../../auth/client-profile';
import { AuthService } from '../../auth/auth.service';
import { BrandLogo } from '../../shared/components/brand-logo/brand-logo';
@Component({
  selector: 'app-client-layout',
  imports: [DatePipe, RouterLink, RouterLinkActive, RouterOutlet, BrandLogo],
  templateUrl: './client-layout.html',
  styleUrl: './client-layout.css',
})
export class ClientLayout {
  private readonly router = inject(Router);
  readonly currentPath = signal(this.router.url);
  readonly showPriceNotice = computed(() => /^\/client\/(overview|portfolio|market-watch|stock-search)(?:[/?#]|$)/.test(this.currentPath()));
  readonly auth = inject(AuthService);
  readonly profile = computed(() => clientProfile(this.auth.claims(), this.auth.email()));
  readonly collapsed = signal(false);
  readonly mobileOpen = signal(false);

  readonly store = inject(PortfolioStore);

  constructor() {
    this.router.events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationEnd) this.currentPath.set(event.urlAfterRedirects);
    });
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
