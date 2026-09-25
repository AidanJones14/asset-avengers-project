import { computed, Injectable, signal } from '@angular/core';

export interface Asset {
  symbol: string;
  name: string;
  price: number;
  change: number;
  shares: number;
  cost: number;
}
export type Side = 'buy' | 'sell';
export interface Order {
  id: number;
  symbol: string;
  side: Side;
  quantity: number;
  total: number;
}
const round = (value: number) => Math.round(value * 100) / 100;

@Injectable({ providedIn: 'root' })
export class PortfolioStore {
  readonly assets = signal<Asset[]>([
    { symbol: 'NVDA', name: 'NVIDIA', price: 142.87, change: 2.34, shares: 120, cost: 124 },
    { symbol: 'AAPL', name: 'Apple', price: 228.26, change: 0.82, shares: 85, cost: 210 },
    { symbol: 'MSFT', name: 'Microsoft', price: 425.52, change: 1.16, shares: 60, cost: 390 },
    { symbol: 'AMZN', name: 'Amazon', price: 208.4, change: -0.64, shares: 95, cost: 197 },
    { symbol: 'GOOGL', name: 'Alphabet', price: 191.33, change: 1.42, shares: 75, cost: 175 },
  ]);
  readonly cash = signal(28450);
  readonly orders = signal<Order[]>([]);
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

  validate(symbol: string, side: Side, quantity: number): string {
    const asset = this.assets().find((a) => a.symbol === symbol);
    if (!asset) return 'Choose an asset.';
    if (!Number.isSafeInteger(quantity) || quantity < 1)
      return 'Enter a whole number of shares, at least 1.';
    if (side === 'buy' && round(quantity * asset.price) > this.cash())
      return 'This order exceeds your available buying power.';
    if (side === 'sell' && quantity > asset.shares)
      return `You hold ${asset.shares} shares of ${symbol}.`;
    return '';
  }

  trade(symbol: string, side: Side, quantity: number): string {
    const error = this.validate(symbol, side, quantity);
    if (error) return error;
    const asset = this.assets().find((a) => a.symbol === symbol)!;
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
      { id: orders.length + 1, symbol, side, quantity, total },
      ...orders,
    ]);
    return '';
  }
}
