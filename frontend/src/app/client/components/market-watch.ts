import { Component, input } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Asset } from '../../portfolio.store';
@Component({
  selector: 'app-market-watch',
  imports: [CurrencyPipe, DecimalPipe],
  templateUrl: './market-watch.html',
  styles: ':host { display: block; min-width: 0; } .market { height: 100%; }',
})
export class MarketWatch {
  readonly assets = input.required<Asset[]>();
}
