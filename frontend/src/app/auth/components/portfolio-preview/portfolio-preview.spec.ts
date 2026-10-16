import { TestBed } from '@angular/core/testing';
import { PortfolioPreview } from './portfolio-preview';

describe('PortfolioPreview auto rotation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    TestBed.configureTestingModule({ imports: [PortfolioPreview] });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('advances every eight seconds, wraps and stops when destroyed', () => {
    const fixture = TestBed.createComponent(PortfolioPreview);
    const carousel = fixture.componentInstance;
    const move = vi.spyOn(carousel, 'move');
    vi.advanceTimersByTime(7999);
    expect(carousel.slide()).toBe(0);
    vi.advanceTimersByTime(1);
    expect(carousel.slide()).toBe(1);
    vi.advanceTimersByTime(16000);
    expect(carousel.slide()).toBe(0);
    expect(move).toHaveBeenCalledTimes(3);
    fixture.destroy();
    vi.advanceTimersByTime(8000);
    expect(move).toHaveBeenCalledTimes(3);
  });

  it('pauses explicitly and while hovered, focused or hidden', () => {
    const fixture = TestBed.createComponent(PortfolioPreview);
    fixture.detectChanges();
    const carousel = fixture.componentInstance;
    const section = fixture.nativeElement.querySelector('section');
    carousel.paused.set(true);
    vi.advanceTimersByTime(8000);
    expect(carousel.slide()).toBe(0);
    carousel.paused.set(false);
    section.dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(8000);
    expect(carousel.slide()).toBe(0);
    section.dispatchEvent(new MouseEvent('mouseleave'));
    section.dispatchEvent(new FocusEvent('focusin'));
    vi.advanceTimersByTime(8000);
    expect(carousel.slide()).toBe(0);
    section.dispatchEvent(new FocusEvent('focusout'));
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    vi.advanceTimersByTime(8000);
    expect(carousel.slide()).toBe(0);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    vi.advanceTimersByTime(8000);
    expect(carousel.slide()).toBe(1);
  });

  it('starts paused for reduced motion', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    const fixture = TestBed.createComponent(PortfolioPreview);
    expect(fixture.componentInstance.paused()).toBe(true);
    vi.advanceTimersByTime(16000);
    expect(fixture.componentInstance.slide()).toBe(0);
  });
});
