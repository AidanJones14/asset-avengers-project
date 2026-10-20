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
  it('restores the saved preference on initialization', () => {
    localStorage.setItem('endgame.theme', 'light');
    expect(TestBed.inject(ThemeService).mode()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
  });
});
