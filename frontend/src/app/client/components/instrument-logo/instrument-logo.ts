import { logoKitToken } from '../../../../environments/logokit.generated';
import { Component, computed, inject, InjectionToken, input, signal } from '@angular/core';
import { Instrument } from '../../../api/instruments/instrument';

export const LOGOKIT_TOKEN = new InjectionToken<string>('LOGOKIT_TOKEN', {
  providedIn: 'root',
  factory: () => logoKitToken,
});

export function logoUrl(instrument: Instrument, token: string): string | null {
  if (!/^pk_[A-Za-z0-9_-]+$/.test(token) || token.includes('REPLACE_WITH')) return null;
  const crypto = /^X:([A-Z0-9]+)-USD$/.exec(instrument.symbol);
  const path = crypto ? `crypto/${crypto[1]}` : `ticker/${encodeURIComponent(instrument.symbol)}`;
  return `https://img.logokit.com/${path}?token=${encodeURIComponent(token)}&size=64&fallback=404`;
}

@Component({
  selector: 'app-instrument-logo',
  template: `@if (url(); as src) {
    @if (failedUrl() !== src) {
      <img [src]="src" width="36" height="36" loading="lazy" decoding="async"
        alt="" referrerpolicy="no-referrer" (error)="failedUrl.set(src)" />
    } @else { <span>{{ initials() }}</span> }
  } @else { <span>{{ initials() }}</span> }`,
  styles: [`:host { display:inline-grid; place-items:center; width:36px; height:36px;
    flex-shrink:0; border-radius:9px; overflow:hidden; background:var(--active); color:var(--green);
    font-size:11px; font-weight:700; vertical-align:middle; }
    img { width:100%; height:100%; object-fit:contain; background:#fff; }`],
})
export class InstrumentLogo {
  readonly instrument = input.required<Instrument>();
  private readonly token = inject(LOGOKIT_TOKEN);
  readonly failedUrl = signal('');
  readonly url = computed(() => logoUrl(this.instrument(), this.token));
  readonly initials = computed(() => this.instrument().symbol.replace(/^X:/, '').slice(0, 2));
}

@Component({
  selector: 'app-logo-attribution',
  template: `@if (enabled) { <a href="https://logokit.com" target="_blank" rel="noopener noreferrer">Logos by LogoKit</a> }`,
  styles: [`:host { display:block; margin-top:12px; font-size:10px; color:var(--muted); } a { color:inherit; }`],
})
export class LogoAttribution {
  readonly enabled = /^pk_[A-Za-z0-9_-]+$/.test(inject(LOGOKIT_TOKEN)) && !inject(LOGOKIT_TOKEN).includes('REPLACE_WITH');
}
