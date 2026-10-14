import { Component, computed, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { InstrumentApiService } from '../../../api/instruments/instrument-api.service';
import { switchMap } from 'rxjs';
import { QuoteApiService } from '../../../api/quotes/quote-api.service';
import { Quote } from '../../../api/quotes/quote';
import { OrderApiService } from '../../../api/orders/order-api.service';
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
  private readonly quotesApi = inject(QuoteApiService);
  private readonly ordersApi = inject(OrderApiService);
  readonly quotes = signal<Record<string, Quote>>({});
  private readonly quoteRequests = new Set<string>();
  readonly searching = signal(false);
  readonly searchError = signal('');
  readonly pending = signal('');
  readonly tradeError = signal('');
  readonly tradeMessage = signal('');
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
  readonly results = computed(() => {
    const query = this.search().trim().toLowerCase();
    return this.store.instruments().filter(asset =>
      asset.symbol.toLowerCase().includes(query) || asset.name.toLowerCase().includes(query),
    );
  });

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
    const symbol = this.search().trim().toUpperCase();
    if (this.searching() || !symbol) return;
    if (!/^[A-Z0-9][A-Z0-9.^-]{0,19}$/.test(symbol)) {
      this.searchError.set('Enter a stock ticker, for example AAPL or BRK-B.');
      return;
    }
    this.searching.set(true);
    this.searchError.set('');
    // Validate against pricing before registering a ticker outside the existing catalogue.
    this.quotesApi.getQuote(symbol).pipe(
      switchMap(quote => {
        if (!quote.price || quote.price <= 0 || quote.symbol?.toUpperCase() !== symbol) {
          throw new Error('No valid price');
        }
        this.quotes.update(values => ({ ...values, [symbol]: quote }));
        return this.api.getInstrumentBySymbol(symbol);
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: instrument => {
        this.store.instruments.update(values => [instrument,
          ...values.filter(value => value.symbol !== instrument.symbol)]);
        this.search.set(instrument.symbol);
        this.searching.set(false);
      },
      error: () => {
        this.searchError.set('Unable to find pricing for that ticker. Check the symbol and try again.');
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
