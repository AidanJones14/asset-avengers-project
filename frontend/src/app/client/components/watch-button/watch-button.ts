import { Component, inject, input } from '@angular/core';
import { PortfolioStore } from '../../state/portfolio.store';

@Component({
  selector: 'app-watch-button',
  template: `<button type="button" (click)="store.toggleWatch(symbol())"
    [class.watched]="store.isWatched(symbol())"
    [attr.aria-pressed]="store.isWatched(symbol())"
    [attr.aria-label]="label()" [attr.title]="label()">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L2.9 9.6l6.3-.9Z" /></svg>
  </button>`,
  styles: `:host { display: inline-flex; vertical-align: middle; } button { width: 36px; height: 36px; padding: 8px; border: 0; color: var(--muted); } svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linejoin: round; } .watched { color: var(--green); } .watched svg { fill: currentColor; } @media (pointer: coarse) { button { width: 44px; height: 44px; } }`,
})
export class WatchButton {
  readonly symbol = input.required<string>();
  readonly store = inject(PortfolioStore);
  label() {
    return this.store.isWatched(this.symbol())
      ? `Remove ${this.symbol()} from market watch`
      : `Add ${this.symbol()} to market watch`;
  }
}
