import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { Quote } from '../../../api/quotes/quote';

@Component({
  selector: 'app-quote-market-card',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, DecimalPipe],
  templateUrl: './quote-market-card.html',
  styleUrl: './quote-market-card.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuoteMarketCard {
  readonly symbol = input.required<string>();
  readonly name = input('');
  readonly quote = input<Quote | null>(null);
  readonly loading = input(false);
  readonly compact = input(false);
  readonly actionLabel = input('');
  readonly action = output<void>();

  readonly isPositive = computed(() => (this.quote()?.change ?? 0) >= 0);
}
