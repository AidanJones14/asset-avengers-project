import { Component, DestroyRef, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, map, of, switchMap, timer } from 'rxjs';
import { InstrumentApiService } from '../../../api/instruments/instrument-api.service';
import { matchingInstruments } from '../../../api/instruments/instrument-search';
import { PortfolioStore } from '../../state/portfolio.store';
import { Instrument } from '../../../api/instruments/instrument';

let nextSearchId = 0;

@Component({
  selector: 'app-instrument-search',
  templateUrl: './instrument-search.html',
  styleUrl: './instrument-search.css',
})
export class InstrumentSearch {
  private readonly focused = signal(false);
  private readonly store = inject(PortfolioStore);
  private readonly api = inject(InstrumentApiService);
  private readonly queries = new Subject<string>();

  readonly selected = output<Instrument>();
  readonly results = signal<Instrument[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly searched = signal(false);
  readonly query = signal('');
  readonly open = signal(false);
  readonly activeIndex = signal(-1);

  readonly inputId = `instrument-search-${nextSearchId++}`;
  readonly listboxId = `${this.inputId}-results`;

  constructor() {
    this.queries.pipe(
      switchMap(query => {
        if (!query) return of({ results: [] as Instrument[], error: '' });
        const matches = matchingInstruments(this.store.instruments(), query)
          .filter(instrument => instrument.active)
          .sort((a, b) => Number(b.symbol.toUpperCase() === query.toUpperCase())
            - Number(a.symbol.toUpperCase() === query.toUpperCase()));
        if (matches.length) return of({ results: matches.slice(0, 8), error: '' });
        if (!/^[A-Za-z0-9][A-Za-z0-9.^-]{0,19}$/.test(query)) {
          return of({ results: [] as Instrument[],
            error: 'No saved company matches that name. Try part of the name or a ticker.' });
        }
        return timer(250).pipe(
          switchMap(() => this.api.getInstrumentBySymbol(query.toUpperCase())),
          map(instrument => ({ results: instrument.active ? [instrument] : [], error: '' })),
          catchError(() => of({ results: [] as Instrument[],
            error: `Stock symbol "${query.toUpperCase()}" not found. Try another.` })),
        );
      }),
      takeUntilDestroyed(inject(DestroyRef)),
    ).subscribe(({ results, error }) => {
      this.results.set(results);
      this.error.set(error);
      this.loading.set(false);
      this.activeIndex.set(-1);
      this.open.set(this.searched() && this.focused());
    });
  }

  search(value: string): void {
    const query = value.trim();
    this.query.set(value);
    this.results.set([]);
    this.error.set('');
    this.searched.set(!!query);
    this.loading.set(!!query);
    this.open.set(!!query);
    this.activeIndex.set(-1);
    this.queries.next(query);
  }

  select(instrument: Instrument): void {
    const name = this.displayName(instrument);
    this.query.set(name ? `${instrument.symbol} — ${name}` : instrument.symbol);
    this.results.set([]);
    this.searched.set(false);
    this.open.set(false);
    this.activeIndex.set(-1);
    this.queries.next('');
    this.selected.emit(instrument);
  }

  clear(input: HTMLInputElement): void {
    this.search('');
    input.focus();
  }

  showSuggestions(): void {
    this.focused.set(true);
    if (this.searched()) this.open.set(true);
  }

  closeWhenFocusLeaves(event: FocusEvent): void {
    const container = event.currentTarget as HTMLElement;
    const nextTarget = event.relatedTarget as Node | null;
    if (!nextTarget || !container.contains(nextTarget)) {
      this.focused.set(false);
      this.open.set(false);
      this.activeIndex.set(-1);
    }
  }

  handleKeydown(event: KeyboardEvent): void {
    const results = this.results();

    if (event.key === 'Escape') {
      this.open.set(false);
      this.activeIndex.set(-1);
      return;
    }

    if (!results.length || !['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;

    if (event.key === 'Enter') {
      event.preventDefault();
      const active = this.activeIndex() >= 0 ? this.activeIndex()
        : results.findIndex(instrument => instrument.symbol.toUpperCase() === this.query().trim().toUpperCase());
      if (active >= 0) this.select(results[active]);
      return;
    }

    event.preventDefault();
    this.open.set(true);
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    const current = this.activeIndex();
    const next = current < 0
      ? direction > 0 ? 0 : results.length - 1
      : (current + direction + results.length) % results.length;
    this.activeIndex.set(next);
  }

  optionId(index: number): string {
    return `${this.inputId}-option-${index}`;
  }

  securityTypeLabel(instrument: Instrument): string {
    return instrument.securityType.replace('_', ' ');
  }

  displayName(instrument: Instrument): string {
    const name = instrument.name?.trim() ?? '';
    return !name || name.toUpperCase() === instrument.symbol.toUpperCase() || name.toUpperCase() === 'UNKNOWN'
      ? ''
      : name;
  }

  instrumentDetails(instrument: Instrument): string {
    const exchange = instrument.exchange?.trim() ?? '';
    const parts = exchange && exchange.toUpperCase() !== 'UNKNOWN' ? [exchange] : [];
    parts.push(this.securityTypeLabel(instrument));
    return parts.join(' · ');
  }
}
