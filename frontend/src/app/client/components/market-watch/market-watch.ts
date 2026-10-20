/**
 * Uses the shared company/ticker lookup, then lets clients persist a watchlist star.
 * PortfolioStore supplies current holdings and watched symbols.
 */

import { Component, computed, DestroyRef, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { InstrumentApiService } from '../../../api/instruments/instrument-api.service';
import { QuoteApiService } from '../../../api/quotes/quote-api.service';
import { Quote } from '../../../api/quotes/quote';
import { StockSearchService } from '../../../api/instruments/stock-search.service';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { PortfolioStore } from '../../state/portfolio.store';
import { Instrument } from '../../../api/instruments/instrument';
import { Subscription } from 'rxjs';
import { TradeDialog } from '../trade-dialog/trade-dialog';
import { WatchButton } from '../watch-button/watch-button';
@Component({
  selector: 'app-market-watch',
  imports: [CurrencyPipe, DecimalPipe, WatchButton, TradeDialog],
  templateUrl: './market-watch.html',
  styleUrl: './market-watch.css',
})
export class MarketWatch {
  readonly expanded = input(false);
  private readonly tradeDialog = viewChild.required(TradeDialog);
  readonly tradeNotice = signal('');
  tradeSelected(): void {
    const selected = this.selectedStock();
    if (selected) { this.tradeNotice.set(''); this.tradeDialog().openTrade(selected.instrument.symbol, selected); }
  }
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
      asOf: this.store.assets().find(asset => asset.symbol === symbol)!.quoteAsOf,
      ask: this.store.assets().find(asset => asset.symbol === symbol)!.quoteAsk,
      bid: this.store.assets().find(asset => asset.symbol === symbol)!.quoteBid,
      stale: this.store.assets().find(asset => asset.symbol === symbol)!.quoteStale,
    } : this.quotes()[symbol],
  })));
  readonly search = signal('');
  readonly results = signal<Instrument[]>([]);
  readonly selectedStock = signal<{ instrument: Instrument; quote: Quote } | null>(null);
  private searchRequest?: Subscription;

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

  updateSearch(value: string): void {
    this.searchRequest?.unsubscribe();
    this.search.set(value);
    this.searching.set(false);
    this.searchError.set('');
    this.results.set([]);
    this.selectedStock.set(null);
  }

  lookupStock(): void {
    if (this.searching() || !this.search().trim()) return;
    const result = this.stockSearch.resolve(this.search(), this.store.instruments());
    this.searchError.set(result.error ?? '');
    this.results.set(result.matches);
    this.selectedStock.set(null);
    if (result.symbol) this.lookupSymbol(result.symbol);
  }

  lookupSymbol(symbol: string): void {
    if (this.searching()) return;
    this.searchRequest?.unsubscribe();
    this.searchError.set('');
    this.results.set([]);
    this.selectedStock.set(null);
    this.searching.set(true);
    this.searchRequest = this.stockSearch.lookup(symbol).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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
        this.selectedStock.set({ instrument, quote });
      },
      error: () => {
        this.searchError.set(`Stock symbol "${symbol}" not found. Try another.`);
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
