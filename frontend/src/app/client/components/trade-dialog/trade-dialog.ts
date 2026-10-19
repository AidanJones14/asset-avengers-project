/**
 * Collects and reviews a client trade, then calls OrderApiService. Browser checks
 * provide quick feedback; the server validates and reserves resources under a lock.
 * A successful submission triggers portfolio refresh rather than a browser-created fill.
 */

import { Component, DestroyRef, ElementRef, inject, signal, viewChild, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { PortfolioStore, Side } from '../../state/portfolio.store';
import { OrderApiService } from '../../../api/orders/order-api.service';
import { StockSearchService } from '../../../api/instruments/stock-search.service';
import { Instrument } from '../../../api/instruments/instrument';
import { Quote } from '../../../api/quotes/quote';
import { OrderType } from '../../../api/orders/order';
import {
  ORDER_TYPES, orderPriceError, orderTypeDescription, orderTypeLabel, usesLimit, usesStop,
} from '../../state/order-rules';

@Component({
  selector: 'app-trade-dialog',
  imports: [FormsModule, CommonModule],
  templateUrl: './trade-dialog.html',
  styleUrl: './trade-dialog.css',
})
export class TradeDialog {
  readonly store = inject(PortfolioStore);
  private readonly ordersApi = inject(OrderApiService);
  private readonly stockSearch = inject(StockSearchService);
  private readonly destroyRef = inject(DestroyRef);
  private quoteRequest?: Subscription;
  readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('tradeDialog');
  readonly stage = signal<'edit' | 'review' | 'search'>('search');
  readonly error = signal('');
  readonly submitting = signal(false);
  readonly filled = output<void>();
  searchSymbol = '';
  readonly companyMatches = signal<Instrument[]>([]);
  readonly searching = signal(false);
  readonly loadingQuote = signal(false);
  readonly searchError = signal<string | null>(null);
  readonly searchResult = signal<{ instrument: Instrument; quote: Quote | null } | null>(null);
  readonly selectedStockInfo = signal<{ instrument: Instrument; quote: Quote | null } | null>(null);
  symbol = '';
  side: Side = 'buy';
  quantity = 1;
  orderType: OrderType = 'market';
  limitPrice: number | null = null;
  stopPrice: number | null = null;
  readonly orderTypes = ORDER_TYPES;
  readonly usesLimit = usesLimit;
  readonly usesStop = usesStop;

  get asset() {
    const selected = this.selectedStockInfo();
    if (selected) return {
      symbol: selected.instrument.symbol, name: selected.instrument.name,
      price: selected.quote?.price ?? 0, change: selected.quote?.changePercent ?? 0,
      shares: this.store.assets().find(asset => asset.symbol === this.symbol)?.shares ?? 0,
      cost: selected.quote?.price ?? 0, instrumentId: selected.instrument.instrumentId,
    };
    return this.store.assets().find(asset => asset.symbol === this.symbol)!;
  }

  get typeLabel() { return orderTypeLabel(this.orderType); }

  get typeDescription() { return orderTypeDescription(this.orderType, this.side); }

  /** The side of the quote this order executes against: ask for buys, bid for sells. */
  get marketPrice(): number {
    const quote = this.selectedStockInfo()?.quote;
    const sidePrice = this.side === 'buy' ? quote?.ask : quote?.bid;
    return sidePrice != null && sidePrice > 0 ? sidePrice : (this.asset?.price ?? 0);
  }

  /**
   * Per-share price for the estimate. For buys this matches the server's cash
   * reservation: the limit, or for stops the higher of the current ask and the stop.
   */
  get estimatedPrice(): number {
    if (usesLimit(this.orderType)) return this.limitPrice ?? 0;
    if (this.orderType === 'stop') {
      const stop = this.stopPrice ?? 0;
      return this.side === 'buy' ? Math.max(this.marketPrice, stop) : stop;
    }
    return this.marketPrice;
  }

  get orderTotal() {
    return this.estimatedPrice * (Number.isFinite(this.quantity) ? this.quantity : 0);
  }

  get totalLabel() {
    if (usesLimit(this.orderType)) return this.side === 'buy' ? 'Maximum total' : 'Minimum proceeds';
    return 'Estimated total';
  }

  /** Warns, without blocking, when the chosen prices are already met by the current quote. */
  get immediateNotice(): string {
    if (this.orderType === 'market' || this.priceError) return '';
    const price = this.marketPrice;
    if (!price) return '';
    const buy = this.side === 'buy';
    if (usesStop(this.orderType) && this.stopPrice != null) {
      const triggered = buy ? price >= this.stopPrice : price <= this.stopPrice;
      return triggered
        ? `The current ${buy ? 'ask' : 'bid'} has already reached your stop price, so this order will likely trigger right away.`
        : '';
    }
    if (this.orderType === 'limit' && this.limitPrice != null) {
      const marketable = buy ? price <= this.limitPrice : price >= this.limitPrice;
      return marketable
        ? `The current ${buy ? 'ask' : 'bid'} already meets your limit, so this order will likely execute right away at the market price.`
        : '';
    }
    return '';
  }

  get priceError() { return orderPriceError(this.orderType, this.side, this.limitPrice, this.stopPrice); }

  setOrderType(type: OrderType) {
    this.orderType = type;
    // Clear prices the new type does not use so they are never submitted by mistake.
    if (!usesLimit(type)) this.limitPrice = null;
    if (!usesStop(type)) this.stopPrice = null;
    this.error.set('');
  }

  openTrade(symbol?: string, selection?: { instrument: Instrument; quote: Quote }) {
    if (this.submitting()) return;
    this.quoteRequest?.unsubscribe();
    this.symbol = symbol ?? '';
    this.side = 'buy';
    this.quantity = 1;
    this.orderType = 'market';
    this.limitPrice = null;
    this.stopPrice = null;
    this.stage.set(symbol ? 'edit' : 'search');
    this.error.set('');
    this.companyMatches.set([]);
    this.searchSymbol = '';
    this.searchResult.set(null);
    this.selectedStockInfo.set(selection ?? null);
    this.searchError.set(null);
    this.searching.set(false);
    this.loadingQuote.set(false);
    this.dialog().nativeElement.showModal();
    if (symbol && !selection) {
      this.loadingQuote.set(true);
      this.quoteRequest = this.stockSearch.lookup(symbol).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: result => {
          this.loadingQuote.set(false);
          if (result.error || !result.quote) { this.error.set(result.error ?? 'Unable to load quote.'); return; }
          this.symbol = result.instrument.symbol;
          this.selectedStockInfo.set(result);
        },
        error: () => { this.loadingQuote.set(false); this.error.set('Unable to load this stock. Search for it again.'); },
      });
    }
  }

  onClose() {
    this.quoteRequest?.unsubscribe();
    this.error.set('');
    this.searching.set(false);
    this.loadingQuote.set(false);
  }

  openSearch() {
    this.quoteRequest?.unsubscribe();
    this.stage.set('search');
    this.companyMatches.set([]);
    this.searchSymbol = '';
    this.searchResult.set(null);
    this.searchError.set(null);
    this.searching.set(false);
    this.loadingQuote.set(false);
  }

  searchStock(form: NgForm): void {
    if (form.invalid || !this.searchSymbol.trim() || this.searching()) return;
    const result = this.stockSearch.resolve(this.searchSymbol, this.store.instruments());
    this.companyMatches.set(result.matches);
    this.searchError.set(result.error);
    this.searchResult.set(null);
    if (result.symbol) this.lookupSymbol(result.symbol);
  }

  lookupSymbol(symbol: string): void {
    if (this.searching()) return;
    this.quoteRequest?.unsubscribe();
    this.companyMatches.set([]);
    this.searchResult.set(null);
    this.searchError.set(null);
    this.searching.set(true);
    this.loadingQuote.set(true);
    this.quoteRequest = this.stockSearch.lookup(symbol).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: result => {
        this.searching.set(false);
        this.loadingQuote.set(false);
        if (result.error || !result.quote) { this.searchError.set(result.error ?? 'Unable to load quote.'); return; }
        this.searchResult.set(result);
      },
      error: () => {
        this.searching.set(false);
        this.loadingQuote.set(false);
        this.searchError.set('Stock not found. Try another ticker or company name.');
      },
    });
  }

  selectSearchedStock(): void {
    const result = this.searchResult();
    if (!result?.quote || !Number.isFinite(result.quote.price) || result.quote.price <= 0) {
      this.searchError.set('Unable to load stock price. Please try again.');
      return;
    }
    this.symbol = result.instrument.symbol;
    this.selectedStockInfo.set(result);
    this.stage.set('edit');
    this.error.set('');
    this.companyMatches.set([]);
    this.searchResult.set(null);
  }

  backToEdit() { this.stage.set('edit'); }

  review() {
    if (!this.selectedStockInfo()?.quote || this.loadingQuote()) {
      this.error.set('Choose a stock and load its quote first.'); return;
    }
    this.error.set(this.validationError());
    if (!this.error()) this.stage.set('review');
  }

  private validationError(): string {
    return this.priceError || this.store.validate(this.symbol, this.side, this.quantity, this.estimatedPrice);
  }

  confirm() {
    if (!this.selectedStockInfo()?.quote) { this.error.set('Choose a stock and load its quote first.'); return; }
    if (!this.store.accountId()) { this.error.set('Your account is still loading. Please try again.'); return; }
    if (this.stage() !== 'review' || this.submitting()) return;
    const validationError = this.validationError();
    if (validationError) {
      this.error.set(validationError);
      this.stage.set('edit');
      return;
    }

    this.submitting.set(true);
    this.error.set('');
    this.ordersApi.createOrder({
        accountId: this.store.accountId()!,
        symbol: this.symbol,
        orderType: this.orderType,
        orderSide: this.side,
        quantity: this.quantity,
        limitPrice: usesLimit(this.orderType) ? this.limitPrice : null,
        stopPrice: usesStop(this.orderType) ? this.stopPrice : null,
      }).pipe(
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: order => {
        this.store.addOrder({
          id: order.orderId,
          symbol: this.symbol,
          side: order.orderSide,
          quantity: order.quantity,
          total: order.price != null ? order.quantity * order.price : null,
          status: order.status,
          type: order.orderType ?? this.orderType,
          limitPrice: order.limitPrice,
          stopPrice: order.stopPrice,
          stopTriggered: order.stopTriggered,
        });
        this.store.requestRefresh();
        this.submitting.set(false);
        if (order.status === 'rejected') {
          this.error.set(order.rejectionReason || 'Order rejected.');
          return;
        }
        this.stage.set('edit');
        this.selectedStockInfo.set(null);
        this.dialog().nativeElement.close();
        this.filled.emit();
      },
      error: (err) => {
        this.submitting.set(false);
        this.error.set(err.error?.detail || 'Unable to place the order. Please try again.');
      },
    });
  }
}
