import { DOCUMENT } from '@angular/common';
import { inject, Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  readonly mode = signal<'light' | 'dark'>('dark');
  constructor() {
    let saved: string | null = null;
    try { saved = localStorage.getItem('endgame.theme'); } catch { /* Storage can be disabled. */ }
    this.apply(saved === 'light' ? 'light' : 'dark');
  }
  toggle() { this.apply(this.mode() === 'dark' ? 'light' : 'dark'); }
  private apply(mode: 'light' | 'dark') {
    this.document.documentElement.dataset['theme'] = mode;
    this.document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'light' ? '#f5f7f5' : '#0c0e10');
    this.mode.set(mode);
    try { localStorage.setItem('endgame.theme', mode); } catch { /* Theme still works in memory. */ }
  }
}
