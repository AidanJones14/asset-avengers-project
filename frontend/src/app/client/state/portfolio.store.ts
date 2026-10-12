import { computed, DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
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
  private readonly quoteApi = inject(QuoteApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly instruments = signal<Instrument[]>([]);
  readonly assets = signal<Asset[]>([
    { symbol: 'NVDA', name: 'NVIDIA', price: 142.87, change: 2.34, shares: 120, cost: 124, instrumentId: '' },
    { symbol: 'AAPL', name: 'Apple', price: 228.26, change: 0.82, shares: 85, cost: 210, instrumentId: '' },
    { symbol: 'MSFT', name: 'Microsoft', price: 425.52, change: 1.16, shares: 60, cost: 390, instrumentId: '' },
    { symbol: 'AMZN', name: 'Amazon', price: 208.4, change: -0.64, shares: 95, cost: 197, instrumentId: '' },
    { symbol: 'GOOGL', name: 'Alphabet', price: 191.33, change: 1.42, shares: 75, cost: 175, instrumentId: '' },
  ]);
  readonly cash = signal(0); // Start with $0 - users must deposit money
  readonly orders = signal<Order[]>([]);
  readonly pricesLoading = signal(false);
  readonly pricesError = signal<string | null>(null);

  private readonly watched = signal<string[]>([]);
  readonly watchedSymbols = this.watched.asReadonly();
  readonly watchlist = computed(() => this.assets().filter(asset => this.watched().includes(asset.symbol)));

  constructor() {
    this.initializePrices();
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
          this.fetchQuotesForAssets(instruments);
        },
        error: (error) => {
          console.error('[Portfolio] Failed to load instruments:', error);
          this.pricesError.set('Failed to load instrument data. Using cached prices.');
          this.pricesLoading.set(false);
        }
      });
  }

  private fetchQuotesForAssets(instruments: Instrument[]): void {
    const assetSymbols = this.assets().map(a => a.symbol);
    console.log('[Portfolio] Asset symbols:', assetSymbols);
    const quoteRequests = instruments
      .filter(i => assetSymbols.includes(i.symbol))
      .map(instrument => {
        // Map instrument to asset
        const asset = this.assets().find(a => a.symbol === instrument.symbol);
        console.log(`[Portfolio] Creating quote request for ${instrument.symbol} (ID: ${instrument.instrumentId})`);
        return {
          instrument,
          asset,
          request: this.quoteApi.getQuote(instrument.instrumentId)
        };
      });

    console.log(`[Portfolio] Created ${quoteRequests.length} quote requests`);
    if (quoteRequests.length === 0) {
      this.pricesLoading.set(false);
      return;
    }

    const requests = quoteRequests.map(r => r.request);
    forkJoin(requests)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (quotes) => {
          console.log('[Portfolio] Received quotes:', quotes);
          this.assets.update(assets =>
            assets.map(asset => {
              const quoteIndex = quoteRequests.findIndex(r => r.asset?.symbol === asset.symbol);
              if (quoteIndex !== -1) {
                const quote = quotes[quoteIndex];
                const instrument = quoteRequests[quoteIndex].instrument;
                console.log(`[Portfolio] Updating ${asset.symbol}: price ${asset.price} → ${quote.price}`);
                return {
                  ...asset,
                  price: quote.price,
                  change: quote.changePercent ?? asset.change,
                  instrumentId: instrument.instrumentId
                };
              }
              return asset;
            })
          );
          this.pricesError.set(null);
          this.pricesLoading.set(false);
          console.log('[Portfolio] Prices updated successfully');
        },
        error: (error) => {
          console.error('[Portfolio] Failed to load quotes:', error);
          this.pricesError.set('Failed to load real-time prices. Using cached prices.');
          this.pricesLoading.set(false);
        }
      });
  }

  isWatched(symbol: string): boolean {
    return this.watched().includes(symbol);
  }

  toggleWatch(symbol: string): void {
    if (!this.isWatched(symbol) && !this.assets().some(asset => asset.symbol === symbol)
      && !this.instruments().some(instrument => instrument.symbol === symbol)) return;
    this.watched.update(symbols => symbols.includes(symbol)
      ? symbols.filter(value => value !== symbol)
      : [...symbols, symbol]);
  }

  readonly holdings = computed(() => this.assets().filter((a) => a.shares > 0));
  readonly value = computed(() =>
    round(this.cash() + this.assets().reduce((sum, a) => sum + a.shares * a.price, 0)),
  );
  readonly costBasis = computed(() => this.assets().reduce((sum, a) => sum + a.shares * a.cost, 0));
  readonly realizedReturn = signal(0);
  readonly totalReturn = computed(() =>
    round(
      this.realizedReturn() +
        this.assets().reduce((sum, a) => sum + a.shares * (a.price - a.cost), 0),
    ),
  );

  validate(symbol: string, side: Side, quantity: number, price?: number): string {
    let asset = this.assets().find((a) => a.symbol === symbol);

    // If asset doesn't exist and we're trying to sell, reject
    if (!asset && side === 'sell') {
      return `You don't hold any shares of ${symbol}.`;
    }

    // If asset doesn't exist, it's a new stock (only allow buy)
    if (!asset) {
      // For new stocks, still validate buying power if price is provided
      if (side === 'buy' && price && round(quantity * price) > this.cash()) {
        return 'This order exceeds your available buying power.';
      }
      return ''; // Will be created on trade if price is loaded
    }

    if (!Number.isSafeInteger(quantity) || quantity < 1)
      return 'Enter a whole number of shares, at least 1.';
    if (side === 'buy' && asset && round(quantity * asset.price) > this.cash())
      return 'This order exceeds your available buying power.';
    if (side === 'sell' && quantity > asset.shares)
      return `You hold ${asset.shares} shares of ${symbol}.`;
    return '';
  }

  trade(symbol: string, side: Side, quantity: number, price?: number, name?: string, instrumentId?: string): string {
    const error = this.validate(symbol, side, quantity, price);
    if (error) return error;

    let asset = this.assets().find((a) => a.symbol === symbol);

    // If asset doesn't exist, create it (for new stocks being traded)
    if (!asset) {
      if (!price || !name || !instrumentId) {
        return 'Stock information not available.';
      }
      asset = {
        symbol,
        name,
        price,
        change: 0,
        shares: 0,
        cost: price,
        instrumentId
      };
      this.assets.update((assets) => [...assets, asset!]);
    }

    const total = round(quantity * asset.price);
    if (side === 'sell')
      this.realizedReturn.update((value) => round(value + quantity * (asset.price - asset.cost)));
    this.assets.update((assets) =>
      assets.map((a) =>
        a.symbol !== symbol
          ? a
          : {
              ...a,
              shares: a.shares + (side === 'buy' ? quantity : -quantity),
              cost: side === 'buy' ? (a.cost * a.shares + total) / (a.shares + quantity) : a.cost,
            },
      ),
    );
    this.cash.update((cash) => round(cash + (side === 'buy' ? -total : total)));
    this.orders.update((orders) => [
      { id: orders.length + 1, symbol, side, quantity, total, status: 'filled' },
      ...orders,
    ]);
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

  depositFunds(amount: number): void {
    this.cash.update(current => round(current + amount));
  }

  withdrawFunds(amount: number): void {
    const currentCash = this.cash();
    if (amount > currentCash) {
      throw new Error('Insufficient funds');
    }
    this.cash.update(current => round(current - amount));
  }
}
