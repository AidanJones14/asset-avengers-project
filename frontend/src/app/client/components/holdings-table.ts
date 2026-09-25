import { Component, input, output } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Asset } from '../../portfolio.store';
@Component({
  selector: 'app-holdings-table',
  imports: [CurrencyPipe, RouterLink],
  templateUrl: './holdings-table.html',
  styles: ':host { display: block; min-width: 0; }',
})
export class HoldingsTable {
  readonly assets = input.required<Asset[]>();
  readonly preview = input(false);
  readonly trade = output<string>();
}
