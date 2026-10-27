import { EasternDatePipe } from '../../../shared/pipes/eastern-date.pipe';
/**
 * Displays the store's current positions and server-recorded purchases. Average
 * cost comes from immutable fill amounts; market value follows quote updates, so
 * refreshing a price must not rewrite the purchase history or cost basis.
 */

import { Component, input, output, signal } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Asset } from '../../state/portfolio.store';
import { WatchButton } from '../watch-button/watch-button';
@Component({
  selector: 'app-holdings-table',
  imports: [EasternDatePipe, CurrencyPipe, DecimalPipe, RouterLink, WatchButton],
  templateUrl: './holdings-table.html',
  styleUrl: './holdings-table.css',
})
export class HoldingsTable {
  readonly assets = input.required<Asset[]>();
  readonly preview = input(false);
  readonly trade = output<string>();
  readonly expanded = signal<string | null>(null);
  readonly aggregate = input(false);
  togglePosition(symbol: string): void {
    this.expanded.update(current => current === symbol ? null : symbol);
  }
  gainPercent(asset: Asset): number | null {
    return asset.costKnown === false || asset.cost <= 0 || asset.price <= 0
      ? null : (asset.price - asset.cost) / asset.cost * 100;
  }
}
