import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { InstrumentApiService } from '../../../api/instruments/instrument-api.service';
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
  private readonly api = inject(InstrumentApiService);
  private readonly destroyRef = inject(DestroyRef);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly watched = computed(() => this.store.watchedSymbols().map(symbol => ({
    symbol,
    quote: this.store.assets().find(asset => asset.symbol === symbol),
  })));
  readonly search = signal('');
  readonly results = computed(() => {
    const query = this.search().trim().toLowerCase();
    return this.store.instruments().filter(asset =>
      asset.symbol.toLowerCase().includes(query) || asset.name.toLowerCase().includes(query),
    );
  });

  constructor() {
    this.loadInstruments();
  }

  loadInstruments(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.api.getAllInstruments().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: instruments => {
        this.store.instruments.set(instruments);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Unable to load instruments. Please try again.');
        this.loading.set(false);
      },
    });
  }
}
