import { Component, input, output, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Asset } from '../../state/portfolio.store';
import { WatchButton } from '../watch-button/watch-button';
@Component({
  selector: 'app-holdings-table',
  imports: [CurrencyPipe, DatePipe, DecimalPipe, RouterLink, WatchButton],
  templateUrl: './holdings-table.html',
  styleUrl: './holdings-table.css',
})
export class HoldingsTable {
  readonly assets = input.required<Asset[]>();
  readonly preview = input(false);
  readonly trade = output<string>();
  readonly expanded = signal<string | null>(null);
  togglePosition(symbol: string): void {
    this.expanded.update(current => current === symbol ? null : symbol);
  }
  gainPercent(asset: Asset): number | null {
    return asset.costKnown === false || asset.cost <= 0 || asset.price <= 0
      ? null : (asset.price - asset.cost) / asset.cost * 100;
  }
}
