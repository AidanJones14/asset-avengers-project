import { Component, inject, input } from '@angular/core';
import { ThemeService } from './theme.service';

@Component({
  selector: 'app-theme-toggle',
  template: `<button type="button" (click)="theme.toggle()" [attr.aria-label]="theme.mode() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'" [title]="theme.mode() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'">
    <svg viewBox="0 0 24 24" aria-hidden="true">@if (theme.mode() === 'dark') { <circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/> } @else { <path d="M20 14A8.5 8.5 0 0 1 10 4a8.5 8.5 0 1 0 10 10Z"/> }</svg>
    @if (!compact()) { <span>{{ theme.mode() === 'dark' ? 'Light mode' : 'Dark mode' }}</span> }
  </button>`,
  styles: `:host { display: block; } button { width: 100%; gap: 10px; min-height: 40px; padding: 8px 10px; font-size: 12px; } svg { width: 18px; height: 18px; flex-shrink: 0; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }`,
})
export class ThemeToggle {
  readonly theme = inject(ThemeService);
  readonly compact = input(false);
}
