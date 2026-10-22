/**
 * Reusable star control connected to PortfolioStore's persisted watchlist action.
 * A star changes selection metadata only; it creates no holding or cash movement.
 */

import { Component, inject, input } from '@angular/core';
import { PortfolioStore } from '../../state/portfolio.store';

@Component({
  selector: 'app-watch-button',
  host: { '[class.prominent]': 'prominent()' },
  template: `<button type="button" (click)="store.toggleWatch(symbol())"
    [class.watched]="store.isWatched(symbol())"
    [attr.aria-pressed]="store.isWatched(symbol())"
    [attr.aria-label]="label()" [attr.title]="label()">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L2.9 9.6l6.3-.9Z" /></svg>
    @if (prominent()) { <span>{{ store.isWatched(symbol()) ? 'Added to watchlist' : 'Add to watchlist' }}</span> }
  </button>`,
  styles: `:host { display: inline-flex; vertical-align: middle; } button { width: 36px; height: 36px; padding: 8px; border: 0; color: var(--muted); } svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linejoin: round; } .watched { color: var(--green); } .watched svg { fill: currentColor; } :host.prominent { display:flex; min-width:0; max-width:100%; } :host.prominent button { display:flex; align-items:center; justify-content:center; gap:8px; box-sizing:border-box; min-width:0; max-width:100%; width:100%; height:auto; min-height:48px; padding:12px clamp(8px, 3cqi, 20px); border:1px solid var(--green); border-radius:9px; background:var(--green); color:#10150b; font-size:14px; font-weight:700; } :host.prominent span { min-width:0; white-space:normal; overflow-wrap:anywhere; line-height:1.35; text-align:center; } :host.prominent button.watched { background:var(--active); color:var(--green); } :host.prominent svg { flex-shrink:0; width:21px; height:21px; } @media (pointer: coarse) { button { width: 44px; height: 44px; } }`,
})
export class WatchButton {
  readonly prominent = input(false);
  readonly symbol = input.required<string>();
  readonly store = inject(PortfolioStore);
  label() {
    return this.store.isWatched(this.symbol())
      ? `Remove ${this.symbol()} from market watch`
      : `Add ${this.symbol()} to market watch`;
  }
}
