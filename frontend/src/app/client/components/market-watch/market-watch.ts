import { Component, computed, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { InstrumentApiService } from '../../../api/instruments/instrument-api.service';
import { QuoteApiService } from '../../../api/quotes/quote-api.service';
import { Quote } from '../../../api/quotes/quote';
import { StockSearchService } from '../../../api/instruments/stock-search.service';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { PortfolioStore } from '../../state/portfolio.store';
import { matchingInstruments } from '../../../api/instruments/instrument-search';
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
  private readonly quotesApi = inject(QuoteApiService);
  private readonly stockSearch = inject(StockSearchService);
  readonly quotes = signal<Record<string, Quote>>({});
  private readonly quoteRequests = new Set<string>();
  readonly searching = signal(false);
  readonly searchError = signal('');
  readonly loading = signal(false);
  readonly error = signal('');
  readonly watched = computed(() => this.store.watchedSymbols().map(symbol => ({
    symbol,
    quote: this.store.assets().find(asset => asset.symbol === symbol && asset.price > 0) ? {
      price: this.store.assets().find(asset => asset.symbol === symbol)!.price,
      changePercent: this.store.assets().find(asset => asset.symbol === symbol)!.change,
    } : this.quotes()[symbol],
  })));
  readonly search = signal('');
  readonly results = computed(() => matchingInstruments(this.store.instruments(), this.search()));

  constructor() {
    this.loadInstruments();
    effect(() => {
      const symbols = this.store.watchedSymbols();
      untracked(() => symbols.forEach(symbol => this.loadQuote(symbol)));
    });
  }

  private loadQuote(symbol: string): void {
    if (this.quotes()[symbol] || this.quoteRequests.has(symbol)) return;
    this.quoteRequests.add(symbol);
    this.quotesApi.getQuote(symbol).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: quote => {
        this.quotes.update(values => ({ ...values, [symbol]: quote }));
        this.quoteRequests.delete(symbol);
      },
      error: () => this.quoteRequests.delete(symbol),
    });
  }

  lookupStock(): void {
    if (this.searching() || !this.search().trim()) return;
    const result = this.stockSearch.resolve(this.search(), this.store.instruments());
    this.searchError.set(result.error ?? '');
    if (!result.symbol) return;
    this.searching.set(true);
    this.stockSearch.lookup(result.symbol).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ instrument, quote, error }) => {
        this.searching.set(false);
        if (error || !quote) {
          this.searchError.set(error ?? 'Failed to load stock price');
          return;
        }
        this.quotes.update(values => ({ ...values, [instrument.symbol]: quote }));
        this.store.instruments.update(values => [instrument,
          ...values.filter(value => value.symbol !== instrument.symbol)]);
        this.search.set(instrument.symbol);
      },
      error: () => {
        this.searchError.set(`Stock symbol "${result.symbol}" not found. Try another.`);
        this.searching.set(false);
      },
    });
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
