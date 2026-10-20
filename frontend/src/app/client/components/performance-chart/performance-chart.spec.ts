import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { PerformanceChart } from './performance-chart';
import { PortfolioStore } from '../../state/portfolio.store';
import { vi } from 'vitest';

describe('Historical portfolio chart', () => {
  it('uses saved account history across component recreation and switches to holdings cost', () => {
    const refreshHistory=vi.fn();
    const store={history:signal([{at:'2026-10-01T12:00:00Z',accountValue:1200,holdingsCost:200,cash:1000,event:'trade'}]),
      historyIncomplete:signal(false),historyLoading:signal(false),historyError:signal(''),refreshHistory};
    TestBed.configureTestingModule({imports:[PerformanceChart],providers:[{provide:PortfolioStore,useValue:store}]});
    const fixture=TestBed.createComponent(PerformanceChart);
    fixture.componentRef.setInput('value',1500);fixture.componentRef.setInput('ready',true);fixture.detectChanges();
    expect(fixture.componentInstance.points()[0].value).toBe(1200);
    expect(fixture.nativeElement.textContent).toContain('Saved transactions');
    expect(fixture.nativeElement.textContent).toContain('not past market prices');
    fixture.componentInstance.historyMode.set('holdingsCost');fixture.detectChanges();
    expect(fixture.componentInstance.points()[0].value).toBe(200);
    fixture.destroy();
    const restored=TestBed.createComponent(PerformanceChart);restored.componentRef.setInput('value',1500);restored.detectChanges();
    expect(restored.componentInstance.points()[0].value).toBe(1200);restored.destroy();
  });
});
