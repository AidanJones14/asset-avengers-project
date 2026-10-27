import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('Theme preference', () => {
  afterEach(() => { localStorage.removeItem('endgame.theme'); delete document.documentElement.dataset['theme']; TestBed.resetTestingModule(); });
  it('toggles both ways and saves the choice', () => {
    localStorage.removeItem('endgame.theme');
    const theme = TestBed.inject(ThemeService);
    expect(theme.mode()).toBe('dark');
    theme.toggle();
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(localStorage.getItem('endgame.theme')).toBe('light');
    theme.toggle();
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });
  it('keeps a preview temporary until explicitly saved', () => {
    localStorage.setItem('endgame.theme', 'dark');
    const theme = TestBed.inject(ThemeService);
    theme.preview('light');
    expect(theme.mode()).toBe('light');
    expect(localStorage.getItem('endgame.theme')).toBe('dark');
    const nextVisit = TestBed.runInInjectionContext(() => new ThemeService());
    expect(nextVisit.mode()).toBe('dark');
    theme.preview('light');
    expect(theme.savePreference('light')).toBe(true);
    expect(TestBed.runInInjectionContext(() => new ThemeService()).mode()).toBe('light');
  });
  it('restores the saved preference on initialization', () => {
    localStorage.setItem('endgame.theme', 'light');
    expect(TestBed.inject(ThemeService).mode()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
  });
});
