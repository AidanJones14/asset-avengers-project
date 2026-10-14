import { Component, output, signal } from '@angular/core';
import { Instrument } from '../../../api/instruments/instrument';

let nextSearchId = 0;

@Component({
  selector: 'app-instrument-search',
  templateUrl: './instrument-search.html',
  styleUrl: './instrument-search.css',
})
export class InstrumentSearch {
  private readonly focused = signal(false);

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

  search(value: string): void {
    const query = value.trim();
    this.query.set(value);
    this.results.set([]);
    this.error.set('');
    this.searched.set(!!query);
    this.loading.set(false);
    this.open.set(!!query);
    this.activeIndex.set(-1);
    // UI-only: search integration will be connected separately.
  }

  select(instrument: Instrument): void {
    const name = this.displayName(instrument);
    this.query.set(name ? `${instrument.symbol} — ${name}` : instrument.symbol);
    this.results.set([]);
    this.searched.set(false);
    this.open.set(false);
    this.activeIndex.set(-1);
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
      const active = this.activeIndex();
      if (active >= 0) {
        event.preventDefault();
        this.select(results[active]);
      }
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
