import { OrderApiService } from '../../../api/orders/order-api.service';
import { Component, inject, signal, viewChild, ElementRef, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { InstrumentApiService } from '../../../api/instruments/instrument-api.service';
import { QuoteApiService } from '../../../api/quotes/quote-api.service';
import { matchingInstruments } from '../../../api/instruments/instrument-search';
import { Instrument } from '../../../api/instruments/instrument';
import { Quote } from '../../../api/quotes/quote';
import { PortfolioStore } from '../../state/portfolio.store';

interface SearchResult {
  instrument: Instrument;
  quote: Quote | null;
  loading: boolean;
  error: string | null;
}

@Component({
  selector: 'app-stock-search-page',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyPipe],
  template: `
    <div class="stock-search-container">
      <h1>Search & Trade Stocks</h1>

      <div class="content">
        <!-- Search Section -->
        <div class="search-section">
          <h2>Look Up a Stock</h2>
          <p class="search-subtitle">Search saved companies by name, or look up a ticker to view its latest quote</p>
          <form #searchForm="ngForm" (ngSubmit)="searchStock(searchForm)" class="search-form-wrapper">
            <div class="search-input-group">
              <input
                type="text"
                name="symbol"
                [(ngModel)]="searchSymbol"
                placeholder="Company name or ticker (e.g., Apple or AAPL)"
                aria-label="Company name or ticker search"
                class="search-input"
              />
              <button type="submit" class="search-btn" [disabled]="searching()">
                @if (searching()) {
                  <span class="spinner"></span> Searching...
                } @else {
                  <span class="search-icon">🔍</span> Search
                }
              </button>
            </div>
            @if (searchError()) {
              <p class="error-message">{{ searchError() }}</p>
            }
          </form>
        </div>

        @if (companyMatches().length) {
          <div class="results-section" aria-label="Matching companies">
            @for (instrument of companyMatches(); track instrument.instrumentId) {
              <button type="button" class="secondary" (click)="lookupSymbol(instrument.symbol)">
                {{ instrument.name }} ({{ instrument.symbol }})
              </button>
            }
          </div>
        }

        <!-- Search Results -->
        @if (searchResult()) {
          <div class="results-section">
            @if (searchResult()!.loading) {
              <p class="loading">Loading stock data...</p>
            }
            @if (searchResult()!.error) {
              <p class="error">{{ searchResult()!.error }}</p>
            }
            @if (searchResult()!.instrument && !searchResult()!.loading && !searchResult()!.error) {
              <div class="stock-card">
                <div class="stock-header">
                  <div class="stock-info">
                    <h3>{{ searchResult()!.instrument.symbol }}</h3>
                    <p class="name">{{ searchResult()!.instrument.name }}</p>
                    <p class="exchange">{{ searchResult()!.instrument.exchange }}</p>
                  </div>
                  <div class="stock-price">
                    @if (searchResult() && searchResult()!.quote) {
                      <div class="price">{{ (searchResult()!.quote?.price ?? 0) | currency }}</div>
                      <div class="change" [class.positive]="((searchResult()!.quote?.changePercent) ?? 0) >= 0" [class.negative]="((searchResult()!.quote?.changePercent) ?? 0) < 0">
                        {{ ((searchResult()!.quote?.changePercent) ?? 0) >= 0 ? '+' : '' }}{{ (searchResult()!.quote?.changePercent) ?? 0 | number: '1.2-2' }}%
                      </div>
                    }
                  </div>
                </div>
                <button class="primary trade-btn" (click)="openTradeDialog(searchResult()!.instrument)">
                  Trade {{ searchResult()!.instrument.symbol }}
                </button>
              </div>
            }
          </div>
        }

        <!-- Trade Dialog -->
        <dialog #tradeDialog class="trade-dialog" aria-labelledby="trade-title">
          <div class="dialog-content">
            <h3 id="trade-title">Trade {{ selectedInstrument()?.symbol }}</h3>
            <form #tradeForm="ngForm" (ngSubmit)="submitTrade(tradeForm)">
              <div class="side-selector">
                <label>
                  <input
                    type="radio"
                    name="side"
                    value="buy"
                    [(ngModel)]="tradeData.side"
                  />
                  Buy
                </label>
                <label>
                  <input
                    type="radio"
                    name="side"
                    value="sell"
                    [(ngModel)]="tradeData.side"
                  />
                  Sell
                </label>
              </div>

              <div class="form-group">
                <label for="quantity">Shares</label>
                <input
                  id="quantity"
                  type="number"
                  name="quantity"
                  [(ngModel)]="tradeData.quantity"
                  min="1"
                  step="1"
                  required
                  placeholder="1"
                />
              </div>

              @if (selectedInstrument() && selectedQuote()) {
                <div class="order-summary">
                  <div class="summary-row">
                    <span>Price per share</span>
                    <strong>{{ selectedQuote()!.price | currency }}</strong>
                  </div>
                  <div class="summary-row">
                    <span>Order total</span>
                    <strong>{{ getOrderTotal() | currency }}</strong>
                  </div>
                  <div class="summary-row">
                    <span>{{ tradeData.side === 'buy' ? 'Cash Available to Trade' : 'Shares held' }}</span>
                    <strong>
                      @if (tradeData.side === 'buy') {
                        {{ portfolioStore.cash() | currency }}
                      } @else {
                        {{ getSharesHeld() }}
                      }
                    </strong>
                  </div>
                </div>
              }

              @if (tradeError()) {
                <p class="error">{{ tradeError() }}</p>
              }

              <div class="dialog-actions">
                <button type="button" class="secondary" (click)="closeTradeDialog()">
                  Cancel
                </button>
                <button type="submit" class="primary" [disabled]="tradeLoading()">
                  {{ tradeLoading() ? 'Processing...' : 'Confirm Trade' }}
                </button>
              </div>
            </form>
          </div>
        </dialog>
      </div>
    </div>
  `,
  styles: [`
    .stock-search-container {
      max-width: 900px;
      margin: 0 auto;
      padding: 2rem;
    }

    h1 {
      margin-bottom: 2rem;
      font-size: 1.8rem;
      color: var(--text);
    }

    .content {
      display: grid;
      gap: 2rem;
    }

    .search-section {
      background: linear-gradient(135deg, #1e2919 0%, var(--active) 100%);
      padding: 3rem 2rem;
      border-radius: 12px;
      border: 1px solid var(--line);
      box-shadow: 0 8px 24px rgba(179, 245, 104, 0.1);
    }

    .search-section h2 {
      color: var(--green);
      margin-bottom: 0.5rem;
      font-size: 1.8rem;
    }

    .search-subtitle {
      color: var(--muted);
      margin-bottom: 1.5rem;
      font-size: 0.95rem;
    }

    .search-form-wrapper {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .search-input-group {
      display: flex;
      gap: 0.75rem;
      align-items: stretch;
    }

    .search-input {
      flex: 1;
      padding: 0.95rem 1.25rem;
      border: 1px solid var(--line);
      border-radius: 8px;
      font-size: 1rem;
      background: var(--panel);
      color: var(--text);
      transition: all 0.3s ease;
    }

    .search-input:focus {
      outline: none;
      border-color: var(--green);
      box-shadow: 0 0 0 3px rgba(179, 245, 104, 0.2);
    }

    .search-input::placeholder {
      color: var(--muted);
    }

    .search-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.95rem 2rem;
      background: var(--green);
      color: #0c0e10;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 1rem;
      font-weight: 600;
      transition: all 0.3s ease;
      box-shadow: 0 4px 12px rgba(179, 245, 104, 0.3);
      min-width: 140px;
    }

    .search-btn:hover:not(:disabled) {
      background: #a8e85a;
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(179, 245, 104, 0.4);
    }

    .search-btn:active:not(:disabled) {
      transform: translateY(0);
    }

    .search-btn:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }

    .search-icon {
      font-size: 1.1rem;
    }

    .spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid var(--green);
      border-radius: 50%;
      border-top-color: transparent;
      animation: spin 0.6s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .error-message {
      color: #ec9292;
      background: rgba(236, 146, 146, 0.1);
      padding: 0.75rem 1rem;
      border-radius: 6px;
      border-left: 3px solid #ec9292;
      font-size: 0.9rem;
      margin: 0;
    }

    .loading {
      color: var(--muted);
      text-align: center;
      padding: 2rem;
    }

    .results-section {
      background: var(--panel);
      padding: 2rem;
      border-radius: 8px;
      border: 1px solid var(--line);
    }

    .stock-card {
      background: var(--active);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 2rem;
    }

    .stock-header {
      display: flex;
      justify-content: space-between;
      align-items: start;
      margin-bottom: 1.5rem;
    }

    .stock-info h3 {
      margin: 0;
      font-size: 1.5rem;
      margin-bottom: 0.5rem;
      color: var(--text);
    }

    .stock-info .name {
      color: var(--muted);
      margin: 0.25rem 0;
    }

    .stock-info .exchange {
      color: var(--muted);
      font-size: 0.9rem;
      margin: 0.25rem 0;
    }

    .stock-price {
      text-align: right;
    }

    .stock-price .price {
      font-size: 1.8rem;
      font-weight: bold;
      margin-bottom: 0.5rem;
      color: var(--green);
    }

    .stock-price .positive {
      color: var(--green);
      font-weight: 500;
    }

    .stock-price .negative {
      color: #ec9292;
      font-weight: 500;
    }

    .trade-btn {
      width: 100%;
      padding: 1rem;
      font-size: 1rem;
      background: var(--green);
      color: #0c0e10;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .trade-btn:hover {
      background: #a8e85a;
    }

    .trade-dialog {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 2rem;
      max-width: 500px;
      background: var(--panel);
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
    }

    .trade-dialog::backdrop {
      background-color: rgba(0, 0, 0, 0.7);
    }

    .dialog-content h3 {
      margin-bottom: 1.5rem;
      font-size: 1.3rem;
      color: var(--green);
    }

    .side-selector {
      display: flex;
      gap: 2rem;
      margin-bottom: 1.5rem;
    }

    .side-selector label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
      font-weight: 500;
      color: var(--text);
    }

    .side-selector input[type="radio"] {
      cursor: pointer;
    }

    .form-group {
      margin-bottom: 1.5rem;
    }

    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
      color: var(--text);
    }

    .form-group input {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid var(--line);
      border-radius: 4px;
      font-size: 1rem;
      background: var(--bg);
      color: var(--text);
    }

    .form-group input:focus {
      outline: none;
      border-color: var(--green);
      box-shadow: 0 0 0 3px rgba(179, 245, 104, 0.1);
    }

    .order-summary {
      background: var(--bg);
      padding: 1rem;
      border-radius: 4px;
      margin-bottom: 1.5rem;
      border: 1px solid var(--line);
    }

    .summary-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 0.5rem;
      font-size: 0.95rem;
      color: var(--muted);
    }

    .summary-row strong {
      font-weight: 600;
      color: var(--text);
    }

    .dialog-actions {
      display: flex;
      gap: 0.75rem;
      margin-top: 1.5rem;
      justify-content: flex-end;
    }

    .dialog-actions button {
      padding: 0.5rem 1.5rem;
      border: none;
      border-radius: 4px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .primary {
      background: var(--green);
      color: #0c0e10;
    }

    .primary:hover:not(:disabled) {
      background: #a8e85a;
    }

    .secondary {
      background-color: var(--line);
      color: var(--text);
    }

    .secondary:hover {
      background-color: var(--active);
    }
  `]
})
export class StockSearchPage {
  private readonly ordersApi = inject(OrderApiService);
  private readonly instrumentApi = inject(InstrumentApiService);
  private readonly quoteApi = inject(QuoteApiService);
  readonly portfolioStore = inject(PortfolioStore);
  private readonly destroyRef = inject(DestroyRef);

  readonly tradeDialog = viewChild.required<ElementRef<HTMLDialogElement>>('tradeDialog');

  searchSymbol = '';
  companyMatches = signal<Instrument[]>([]);
  searching = signal(false);
  searchError = signal<string | null>(null);
  searchResult = signal<SearchResult | null>(null);

  selectedInstrument = signal<Instrument | null>(null);
  selectedQuote = signal<Quote | null>(null);
  tradeLoading = signal(false);
  tradeError = signal<string | null>(null);

  tradeData = {
    side: 'buy' as 'buy' | 'sell',
    quantity: 1
  };

  searchStock(form: NgForm): void {
    if (form.invalid || !this.searchSymbol.trim()) {
      return;
    }

    const query = this.searchSymbol.trim();
    const matches = matchingInstruments(this.portfolioStore.instruments(), query);
    this.companyMatches.set([]);
    this.searchError.set(null);
    this.searchResult.set(null);
    const exactTicker = matches.find(instrument => instrument.symbol.toUpperCase() === query.toUpperCase());
    if (exactTicker) { this.lookupSymbol(exactTicker.symbol); return; }
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
    this.searching.set(true);
    this.searchError.set(null);
    this.searchResult.set({
      instrument: null as any,
      quote: null,
      loading: true,
      error: null
    });

    this.instrumentApi.getInstrumentBySymbol(symbol)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (instrument) => {
          // Fetch quote for the instrument
          this.quoteApi.getQuote(instrument.symbol)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: (quote) => {
                this.searchResult.set({
                  instrument,
                  quote,
                  loading: false,
                  error: null
                });
                this.searching.set(false);
              },
              error: (err) => {
                this.searchResult.set({
                  instrument,
                  quote: null,
                  loading: false,
                  error: 'Failed to load stock price'
                });
                this.searching.set(false);
              }
            });
        },
        error: (err) => {
          this.searchError.set(`Stock symbol "${symbol}" not found. Try another.`);
          this.searchResult.set(null);
          this.searching.set(false);
        }
      });
  }

  openTradeDialog(instrument: Instrument): void {
    if (!this.searchResult()?.quote) return;

    this.selectedInstrument.set(instrument);
    this.selectedQuote.set(this.searchResult()!.quote);
    this.tradeData.side = 'buy';
    this.tradeData.quantity = 1;
    this.tradeError.set(null);

    this.tradeDialog().nativeElement.showModal();
  }

  closeTradeDialog(): void {
    this.tradeDialog().nativeElement.close();
  }

  getOrderTotal(): number {
    if (!this.selectedQuote()) return 0;
    return this.selectedQuote()!.price * this.tradeData.quantity;
  }

  getSharesHeld(): number {
    if (!this.selectedInstrument()) return 0;
    const asset = this.portfolioStore.assets().find(a => a.symbol === this.selectedInstrument()!.symbol);
    return asset?.shares || 0;
  }

  submitTrade(form: NgForm): void {
    if (form.invalid || !this.selectedInstrument() || !this.selectedQuote()) {
      return;
    }

    const symbol = this.selectedInstrument()!.symbol;
    const error = this.portfolioStore.validate(symbol, this.tradeData.side, this.tradeData.quantity);

    if (error) {
      this.tradeError.set(error);
      return;
    }

    this.tradeLoading.set(true);
    this.tradeError.set(null);

    const accountId = this.portfolioStore.accountId();
    if (!accountId) { this.tradeLoading.set(false); this.tradeError.set('Your account is still loading.'); return; }
    this.ordersApi.createOrder({ accountId, symbol, orderType: 'market', orderSide: this.tradeData.side,
      quantity: this.tradeData.quantity, limitPrice: null, stopPrice: null,
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.tradeLoading.set(false); this.portfolioStore.requestRefresh(); this.closeTradeDialog(); },
      error: err => { this.tradeLoading.set(false); this.tradeError.set(err.error?.detail || 'Unable to submit order'); },
    });
  }
}
