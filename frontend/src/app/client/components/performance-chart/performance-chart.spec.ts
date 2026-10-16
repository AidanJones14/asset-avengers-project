import { TestBed } from '@angular/core/testing';
import { PerformanceChart } from './performance-chart';

describe('PerformanceChart', () => {
  it('waits for the account before recording a value and exposes real observations', () => {
    TestBed.configureTestingModule({ imports: [PerformanceChart] });
    const fixture = TestBed.createComponent(PerformanceChart);
    fixture.componentRef.setInput('value', 0);
    fixture.componentRef.setInput('ready', false);
    fixture.detectChanges();
    expect(fixture.componentInstance.points()).toEqual([]);
    fixture.componentRef.setInput('value', 1234.56);
    fixture.componentRef.setInput('ready', true);
    fixture.detectChanges();
    expect(fixture.componentInstance.points().map(point => point.value)).toEqual([1234.56]);
    expect(fixture.nativeElement.querySelector('tbody').textContent).toContain('$1,234.56');
    expect(fixture.nativeElement.textContent).toContain('This session');
    fixture.destroy();
  });
});
