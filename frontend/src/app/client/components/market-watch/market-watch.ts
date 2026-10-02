import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { PortfolioStore } from '../../state/portfolio.store';
import { WatchButton } from '../watch-button/watch-button';
@Component({
  selector: 'app-market-watch',
  imports: [CurrencyPipe, DecimalPipe, WatchButton],
  templateUrl: './market-watch.html',
  styleUrl: './market-watch.css',
})
export class MarketWatch {
  readonly store = inject(PortfolioStore);
  readonly search = signal('');
  readonly results = computed(() => {
    const query = this.search().trim().toLowerCase();
    return this.store.assets().filter(asset =>
      asset.symbol.toLowerCase().includes(query) || asset.name.toLowerCase().includes(query),
    );
  });
}
