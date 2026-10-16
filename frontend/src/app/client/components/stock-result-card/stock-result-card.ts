import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Instrument } from '../../../api/instruments/instrument';
import { Quote } from '../../../api/quotes/quote';

@Component({
  selector: 'app-stock-result-card',
  imports: [CommonModule],
  templateUrl: './stock-result-card.html',
  styleUrl: './stock-result-card.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StockResultCard {
  readonly instrument = input.required<Instrument>();
  readonly quote = input<Quote | null>(null);
  readonly trade = output<Instrument>();
}
