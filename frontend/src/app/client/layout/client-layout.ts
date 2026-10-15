import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PortfolioStore } from '../state/portfolio.store';
import { RouterOutlet } from '@angular/router';
import { NavigationSidebar } from '../components/navigation-sidebar/navigation-sidebar';

@Component({
  selector: 'app-client-layout',
  imports: [RouterOutlet, NavigationSidebar],
  templateUrl: './client-layout.html',
  styleUrl: './client-layout.css',
})
export class ClientLayout {
  private readonly store = inject(PortfolioStore);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    this.store.startSession();
    this.store.livePrices().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
    this.store.liveUpdates().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
  }
}
