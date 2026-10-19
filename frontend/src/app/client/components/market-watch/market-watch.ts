/**
 * Combines catalogue matching, persisted watchlist stars and one-share trade
 * shortcuts. PortfolioStore supplies current state; OrderApiService performs trades.
 */

import { Component, computed, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { InstrumentApiService } from '../../../api/instruments/instrument-api.service';
import { QuoteApiService } from '../../../api/quotes/quote-api.service';
import { OrderApiService } from '../../../api/orders/order-api.service';
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
  private readonly ordersApi = inject(OrderApiService);
  readonly pending = signal('');
  readonly tradeError = signal('');
  readonly tradeMessage = signal('');
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

  canSell(symbol: string): boolean {
    return (this.store.assets().find(asset => asset.symbol === symbol)?.shares ?? 0) >= 1;
  }

  tradeOne(symbol: string, side: 'buy' | 'sell'): void {
    if (!this.store.accountId()) { this.tradeError.set('Your account is still loading. Please try again.'); return; }
    if (this.pending() || (side === 'sell' && !this.canSell(symbol))) return;
    this.pending.set(symbol + ':' + side);
    this.tradeError.set('');
    this.tradeMessage.set('');
    this.ordersApi.createOrder({ accountId: this.store.accountId()!, symbol, quantity: 1,
      orderType: 'market', orderSide: side, limitPrice: null, stopPrice: null,
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: order => {
        this.store.addOrder({ id: order.orderId, symbol, side, quantity: 1,
          total: order.price ?? null, status: order.status });
        this.store.requestRefresh();
        this.pending.set('');
        if (order.status === 'rejected') {
          this.tradeError.set(order.rejectionReason || 'Order rejected.');
          return;
        }
        this.tradeMessage.set((side === 'buy' ? 'Buy' : 'Sell') + ' order for 1 ' + symbol
          + ' submitted. Your portfolio updates when it fills.');
      },
      error: err => {
        this.pending.set('');
        this.tradeError.set(err.error?.detail || 'Unable to submit the order. Please try again.');
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
