import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, exhaustMap, timer } from 'rxjs';
import { QuoteApiService } from '../../../api/quotes/quote-api.service';
import { Quote } from '../../../api/quotes/quote';

@Component({
  selector: 'app-search-highlights',
  imports: [CommonModule],
  templateUrl: './search-highlights.html',
  styleUrl: './search-highlights.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchHighlights {
  private readonly quotes = inject(QuoteApiService);
  private readonly symbols = ['AAPL', 'MSFT', 'NVDA', 'GOOG', 'AMZN', 'META', 'TSLA', 'AMD', 'NFLX', 'SPY', 'QQQ', 'VOO'];
  private previousSymbol: string | null = null;
  readonly paused = signal(false);
  readonly latest = signal<Quote | null>(null);
  readonly quoteError = signal(false);

  constructor() {
    // One quote per carousel cycle, independent of the stock being searched.
    timer(0, 18000).pipe(
      exhaustMap(() => {
        if (this.paused() || document.hidden) return EMPTY;
        const candidates = this.symbols.filter(symbol => symbol !== this.previousSymbol);
        const symbol = candidates[Math.floor(Math.random() * candidates.length)];
        this.previousSymbol = symbol;
        return this.quotes.getQuote(symbol).pipe(catchError(() => {
          this.quoteError.set(true);
          return EMPTY;
        }));
      }),
      takeUntilDestroyed(),
    ).subscribe(quote => {
      if (this.paused()) return;
      if (Number.isFinite(quote.price) && quote.price > 0) {
        this.latest.set({ ...quote, currency: quote.currency || 'USD' });
        this.quoteError.set(false);
      } else this.quoteError.set(true);
    });
  }
}
