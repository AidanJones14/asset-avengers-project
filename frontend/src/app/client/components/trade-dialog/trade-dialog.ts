/**
 * Collects and reviews a client trade, then calls OrderApiService. Browser checks
 * provide quick feedback; the server validates and reserves resources under a lock.
 * A successful submission triggers portfolio refresh rather than a browser-created fill.
 */

import { Component, DestroyRef, ElementRef, inject, signal, viewChild, output } from '@angular/core';
import { CurrencyPipe, CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { PortfolioStore, Side } from '../../state/portfolio.store';
import { OrderApiService } from '../../../api/orders/order-api.service';
import { InstrumentApiService } from '../../../api/instruments/instrument-api.service';
import { QuoteApiService } from '../../../api/quotes/quote-api.service';
import { matchingInstruments } from '../../../api/instruments/instrument-search';
import { Instrument } from '../../../api/instruments/instrument';
import { Quote } from '../../../api/quotes/quote';

@Component({
  selector: 'app-trade-dialog',
  imports: [CurrencyPipe, FormsModule, CommonModule],
  templateUrl: './trade-dialog.html',
  styles: [`
    .asset-selector {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }

    .asset-selector select {
      flex: 1;
    }

    .search-btn {
      padding: 0.5rem 0.75rem;
      font-size: 1.1rem;
      cursor: pointer;
      border: 1px solid var(--line);
      border-radius: 4px;
      background: var(--panel);
      color: var(--text);
      transition: all 0.2s;
    }

    .search-btn:hover {
      border-color: var(--green);
      background: var(--active);
    }

    .search-result {
      background: var(--active);
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 1rem;
      margin: 1rem 0;
    }

    .result-header {
      margin-bottom: 0.75rem;
    }

    .result-header h4 {
      margin: 0 0 0.25rem 0;
      color: var(--green);
      font-size: 1.1rem;
    }

    .result-name {
      margin: 0;
      color: var(--muted);
      font-size: 0.9rem;
    }

    .result-price {
      font-size: 1.3rem;
      font-weight: bold;
      color: var(--text);
      margin-bottom: 0.75rem;
    }

    .loading-quote {
      color: var(--muted);
      font-size: 0.9rem;
      margin: 0.75rem 0;
      text-align: center;
    }
  `]
})
export class TradeDialog {
  readonly store = inject(PortfolioStore);
  private readonly ordersApi = inject(OrderApiService);
  private readonly instrumentApi = inject(InstrumentApiService);
  private readonly quoteApi = inject(QuoteApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('tradeDialog');
  readonly stage = signal<'edit' | 'review' | 'search'>('edit');
  readonly error = signal('');
  readonly submitting = signal(false);
  readonly filled = output<void>();

  // Search state
  searchSymbol = '';
  companyMatches = signal<Instrument[]>([]);
  searching = signal(false);
  loadingQuote = signal(false);
  searchError = signal<string | null>(null);
  searchResult = signal<{ instrument: Instrument; quote: Quote | null } | null>(null);

  // Persistent stock info (used for searched stocks)
  selectedStockInfo = signal<{ instrument: Instrument; quote: Quote | null } | null>(null);

  symbol = 'AAPL';
  side: Side = 'buy';
  quantity = 1;

  get asset() {
    // First check if there's a selected stock from search
    const selectedStock = this.selectedStockInfo();
    if (selectedStock) {
      return {
        symbol: selectedStock.instrument.symbol,
        name: selectedStock.instrument.name,
        price: selectedStock.quote?.price ?? 0,
        change: selectedStock.quote?.changePercent ?? 0,
        shares: this.store.assets().find(a => a.symbol === this.symbol)?.shares ?? 0,
        cost: selectedStock.quote?.price ?? 0,
        instrumentId: selectedStock.instrument.instrumentId
      };
    }
    // Otherwise look for it in the store
    return this.store.assets().find((a) => a.symbol === this.symbol)!;
  }

  get orderTotal() {
    const asset = this.asset;
    if (!asset) return 0;
    return asset.price * (Number.isFinite(this.quantity) ? this.quantity : 0);
  }

  openTrade(symbol = 'AAPL') {
    this.symbol = symbol;
    this.side = 'buy';
    this.quantity = 1;
    this.stage.set('edit');
    this.error.set('');
    this.companyMatches.set([]);
    this.searchSymbol = '';
    this.searchResult.set(null);
    this.selectedStockInfo.set(null);
    this.searchError.set(null);

    this.dialog().nativeElement.showModal();
    const instrument = this.store.instruments().find(value => value.symbol === symbol);
    if (instrument) this.quoteApi.getQuote(symbol).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: quote => this.selectedStockInfo.set({ instrument, quote }),
      error: () => this.error.set('Unable to load the current price. Please try again.'),
    });
  }

  openSearch() {
    this.stage.set('search');
    this.companyMatches.set([]);
    this.searchSymbol = '';
    this.searchResult.set(null);
    this.searchError.set(null);
  }

  searchStock(form: NgForm): void {
    if (form.invalid || !this.searchSymbol.trim()) {
      return;
    }

    if (this.searching()) return;
    const query = this.searchSymbol.trim();
    this.companyMatches.set([]);
    this.searchError.set(null);
    this.searchResult.set(null);
    const matches = matchingInstruments(this.store.instruments(), query);
    const exact = matches.find(instrument => instrument.symbol.toUpperCase() === query.toUpperCase());
    if (exact) { this.lookupSymbol(exact.symbol); return; }
    if (matches.length) { this.companyMatches.set(matches); return; }
    if (!/^[A-Za-z0-9][A-Za-z0-9.^-]{0,19}$/.test(query)) {
      this.searchError.set('No saved company matches that name. Try part of the name or a ticker.');
      return;
    }
    this.lookupSymbol(query.toUpperCase());
  }

  lookupSymbol(symbol: string): void {
    if (this.searching()) return;
    this.companyMatches.set([]);
    this.searchResult.set(null);
    this.searching.set(true);
    this.searchError.set(null);

    this.instrumentApi
      .getInstrumentBySymbol(symbol)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (instrument) => {
          this.loadingQuote.set(true);
          this.quoteApi
            .getQuote(instrument.symbol)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: (quote) => {
                this.searchResult.set({ instrument, quote });
                this.searching.set(false);
                this.loadingQuote.set(false);
              },
              error: (err) => {
                this.searchError.set('Unable to load stock price. Please try again.');
                this.searching.set(false);
                this.loadingQuote.set(false);
                console.error('Quote fetch error:', err);
              },
            });
        },
        error: () => {
          this.searchError.set('Stock not found');
          this.searching.set(false);
        },
      });
  }

  selectSearchedStock(): void {
    const result = this.searchResult();
    if (result && result.instrument) {
      // Check if we have a quote with price
      if (!result.quote || !result.quote.price) {
        this.searchError.set('Unable to load stock price. Please try again.');
        return;
      }
      this.symbol = result.instrument.symbol;
      this.selectedStockInfo.set(result); // Persist the stock info
      this.stage.set('edit');
      this.companyMatches.set([]);
      this.searchSymbol = '';
      this.searchResult.set(null); // Clear search result
    }
  }

  backToEdit() {
    this.stage.set('edit');
  }

  review() {
    const selectedStock = this.selectedStockInfo();
    const price = selectedStock?.quote?.price;
    this.error.set(this.store.validate(this.symbol, this.side, this.quantity, price));
    if (!this.error()) this.stage.set('review');
  }

  confirm() {
    if (!this.store.accountId()) { this.error.set('Your account is still loading. Please try again.'); return; }
    if (this.stage() !== 'review' || this.submitting()) return;
    const price = this.selectedStockInfo()?.quote?.price;
    const validationError = this.store.validate(this.symbol, this.side, this.quantity, price);
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
        orderType: 'market',
        orderSide: this.side,
        quantity: this.quantity,
        limitPrice: null,
        stopPrice: null,
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
        });
        this.store.requestRefresh();
        this.submitting.set(false);
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
