import { computed, DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, exhaustMap, merge, tap, timer } from 'rxjs';
import { BankAccountApiService } from '../../api/bank-accounts/bank-account-api.service';
import { HttpClient } from '@angular/common/http';
import { Instrument } from '../../api/instruments/instrument';
import { InstrumentApiService } from '../../api/instruments/instrument-api.service';
import { QuoteApiService } from '../../api/quotes/quote-api.service';

export interface Asset {
  symbol: string;
  name: string;
  price: number;
  change: number;
  shares: number;
  cost: number;
  costKnown?: boolean;
  instrumentId: string;
}
export type Side = 'buy' | 'sell';
export interface Order {
  id: string | number;
  symbol: string;
  side: Side;
  quantity: number;
  total: number | null;
  status: string;
}
const round = (value: number) => Math.round(value * 100) / 100;

@Injectable({ providedIn: 'root' })
export class PortfolioStore {
  private readonly instrumentApi = inject(InstrumentApiService);
  private readonly banking = inject(BankAccountApiService);
  private readonly refreshRequests = new Subject<void>();
  private readonly quoteApi = inject(QuoteApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly instruments = signal<Instrument[]>([]);
  readonly assets = signal<Asset[]>([]);
  readonly accountId = signal<string | null>(null);
  private readonly http = inject(HttpClient);
  private watchPending = false;
  private sessionVersion = 0;
  private watchVersion = 0;
  readonly cash = signal(0); // Start with $0 - users must deposit money
  readonly orders = signal<Order[]>([]);
  readonly cashBalance = signal(0);
  readonly portfolioError = signal<string | null>(null);
  readonly pricesLoading = signal(false);
  readonly pricesError = signal<string | null>(null);

  private readonly watched = signal<string[]>([]);
  readonly watchedSymbols = this.watched.asReadonly();
  readonly watchlist = computed(() => this.assets().filter(asset => this.watched().includes(asset.symbol)));

  startSession(): void {
    this.sessionVersion++; this.watchVersion++; this.watchPending = false;
    this.assets.set([]); this.watched.set([]); this.orders.set([]);
    this.cash.set(0); this.cashBalance.set(0); this.realizedReturn.set(0); this.accountId.set(null);
    this.initializePrices();
    this.refreshPortfolio().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
  }

  // Subscribe from the client layout so polling stops on logout/navigation out of the client area.
  liveUpdates() {
    return merge(timer(1000, 3000), this.refreshRequests).pipe(
      exhaustMap(() => document.hidden ? EMPTY : this.refreshPortfolio()),
    );
  }

  livePrices() {
    return timer(0, 15000).pipe(tap(() => { if (!document.hidden) this.fetchQuotesForAssets(this.instruments()); }));
  }

  requestRefresh(): void {
    this.refreshRequests.next();
  }

  private refreshPortfolio() {
    const sessionVersion = this.sessionVersion;
    const watchVersion = this.watchVersion;
    return this.banking.getTradingAccount().pipe(
      tap(account => {
        if (sessionVersion !== this.sessionVersion) return;
        this.accountId.set(account.accountId);
        if (!this.watchPending && watchVersion === this.watchVersion) this.watched.set(account.watchedSymbols ?? []);
        this.cashBalance.set(account.cashBalance);
        this.cash.set(account.availableCash);
        this.realizedReturn.set(account.realizedReturn ?? 0);
        const positions = new Map(account.holdings.map(position => [position.symbol, position]));
        const knownSymbols = new Set(this.assets().map(asset => asset.symbol));
        const added = account.holdings.filter(position => !knownSymbols.has(position.symbol));
        this.assets.update(assets => [
          ...assets.map(asset => ({ ...asset, shares: positions.get(asset.symbol)?.quantity ?? 0,
            instrumentId: positions.get(asset.symbol)?.instrumentId || asset.instrumentId,
            cost: positions.get(asset.symbol)?.averageCost ?? 0,
            costKnown: positions.get(asset.symbol)?.averageCost != null })),
          ...added.map(position => ({ symbol: position.symbol, name: position.name,
            shares: position.quantity, instrumentId: position.instrumentId, price: 0, cost: position.averageCost ?? 0, costKnown: position.averageCost != null, change: 0 })),
        ]);
        if (added.length) this.fetchQuotesForAssets(this.instruments());
        const symbols = new Map([
          ...this.instruments().map(instrument => [instrument.instrumentId, instrument.symbol] as const),
          ...account.holdings.map(position => [position.instrumentId, position.symbol] as const),
        ]);
        this.replaceOrders(account.orders.map(order => ({ id: order.orderId,
          symbol: symbols.get(order.instrumentId) ?? this.orders().find(value => value.id === order.orderId)?.symbol ?? 'Unknown',
          side: order.orderSide, quantity: order.quantity, status: order.status,
          total: order.price == null ? null : order.price * order.quantity,
        })));
        this.portfolioError.set(null);
      }),
      catchError(() => {
        if (sessionVersion !== this.sessionVersion) return EMPTY;
        this.portfolioError.set('Unable to refresh your portfolio. Retrying…');
        return EMPTY;
      }),
    );
  }

  private initializePrices(): void {
    this.pricesLoading.set(true);
    this.pricesError.set(null);

    console.log('[Portfolio] Initializing prices...');
    this.instrumentApi.getAllInstruments()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (instruments) => {
          console.log('[Portfolio] Fetched instruments:', instruments);
          this.instruments.set(instruments);
          this.assets.update(assets => [...assets, ...instruments.filter(instrument =>
            !assets.some(asset => asset.symbol === instrument.symbol)).map(instrument => ({
              symbol: instrument.symbol, name: instrument.name, instrumentId: instrument.instrumentId,
              shares: 0, cost: 0, costKnown: false, price: 0, change: 0,
            }))]);
          this.fetchQuotesForAssets(instruments);
        },
        error: (error) => {
          console.error('[Portfolio] Failed to load instruments:', error);
          this.pricesError.set('Failed to load instrument data. Using cached prices.');
          this.pricesLoading.set(false);
        }
      });
  }

  private readonly quoting = new Set<string>();

  private fetchQuotesForAssets(instruments: Instrument[]): void {
    const symbols = new Set([...this.holdings().map(asset => asset.symbol), ...this.watchedSymbols()]);
    // Newly purchased symbols may appear in holdings before the instrument catalogue refreshes.
    const targets = new Map([...instruments, ...this.assets()].map(asset => [asset.symbol, asset.instrumentId]));
    for (const symbol of symbols) {
      if (this.quoting.has(symbol)) continue;
      this.quoting.add(symbol);
      this.quoteApi.getQuote(symbol).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: quote => {
          if (Number.isFinite(quote.price) && quote.price > 0) {
            this.assets.update(assets => assets.map(asset => asset.symbol === symbol ? {
              ...asset, price: quote.price, change: quote.changePercent ?? asset.change,
              instrumentId: targets.get(symbol) || asset.instrumentId,
            } : asset));
            this.pricesError.set(null);
          }
          this.quoting.delete(symbol);
          this.pricesLoading.set(false);
        },
        error: () => {
          this.quoting.delete(symbol);
          this.pricesLoading.set(false);
          this.pricesError.set('Unable to refresh some prices. Showing the last available quotes.');
        },
      });
    }
    if (!this.quoting.size) this.pricesLoading.set(false);
  }

  isWatched(symbol: string): boolean {
    return this.watched().includes(symbol);
  }

  toggleWatch(symbol: string): void {
    if (this.watchPending) return;
    this.watchPending = true;
    const sessionVersion = this.sessionVersion;
    const url = '/api/v1/me/watchlist/' + encodeURIComponent(symbol);
    const request = this.isWatched(symbol) ? this.http.delete<string[]>(url) : this.http.put<string[]>(url, {});
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: symbols => { if (sessionVersion !== this.sessionVersion) return; this.watchVersion++; this.watched.set(symbols); this.watchPending = false; },
      error: () => { if (sessionVersion !== this.sessionVersion) return; this.watchPending = false; this.portfolioError.set('Unable to save your watchlist. Please try again.'); },
    });
  }

  readonly holdings = computed(() => this.assets().filter((a) => a.shares > 0));
  readonly value = computed(() =>
    round(this.cashBalance() + this.assets().reduce((sum, a) => sum + a.shares * a.price, 0)),
  );
  readonly costBasis = computed(() => this.assets().reduce((sum, a) => sum + a.shares * a.cost, 0));
  readonly realizedReturn = signal(0);
  readonly totalReturn = computed(() =>
    round(
      this.realizedReturn() +
        this.assets().reduce((sum, a) => sum + (a.costKnown === false ? 0 : a.shares * (a.price - a.cost)), 0),
    ),
  );

  validate(symbol: string, side: Side, quantity: number, price?: number): string {
    if (!Number.isSafeInteger(quantity) || quantity < 1) return 'Enter a whole number of shares, at least 1.';
    let asset = this.assets().find((a) => a.symbol === symbol);

    // If asset doesn't exist and we're trying to sell, reject
    if (!asset && side === 'sell') {
      return `You don't hold any shares of ${symbol}.`;
    }

    // If asset doesn't exist, it's a new stock (only allow buy)
    if (!asset) {
      // For new stocks, still validate cash available to trade if price is provided
      if (side === 'buy' && price && round(quantity * price) > this.cash()) {
        return 'This order exceeds your cash available to trade.';
      }
      return ''; // Will be created on trade if price is loaded
    }

    if (!Number.isSafeInteger(quantity) || quantity < 1)
      return 'Enter a whole number of shares, at least 1.';
    if (side === 'buy' && asset && round(quantity * (price ?? asset.price)) > this.cash())
      return 'This order exceeds your cash available to trade.';
    if (side === 'sell' && quantity > asset.shares)
      return `You hold ${asset.shares} shares of ${symbol}.`;
    return '';
  }

  replaceOrders(orders: Order[]): void {
    this.orders.set(orders);
  }

  addOrder(order: Order): void {
    this.orders.update(orders => [order, ...orders]);
  }

  updateOrderStatus(orderId: string, status: string): void {
    this.orders.update(orders => orders.map(order =>
      order.id === orderId ? { ...order, status } : order,
    ));
  }

}
