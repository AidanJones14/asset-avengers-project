import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HoldingsTable } from './holdings-table';
import { Asset } from '../../state/portfolio.store';

describe('HoldingsTable purchase and market prices', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [HoldingsTable],
    providers: [provideHttpClient(), provideRouter([])] }));
  const holding: Asset = { symbol: 'WMT', name: 'Walmart', shares: 2, cost: 90,
    costKnown: true, price: 100, change: 0, instrumentId: 'wmt' };
  it('keeps average purchase price separate as live market price and position value change', () => {
    const fixture = TestBed.createComponent(HoldingsTable);
    fixture.componentRef.setInput('assets', [holding]);
    fixture.detectChanges();
    const values = () => [...fixture.nativeElement.querySelectorAll('tbody td')].map((cell: any) => cell.textContent.trim());
    expect(values().slice(2, 6)).toEqual(['$90.00', '$100.00', '$200.00', '+$20.00']);
    fixture.componentRef.setInput('assets', [{ ...holding, price: 110 }]);
    fixture.detectChanges();
    expect(values().slice(2, 6)).toEqual(['$90.00', '$110.00', '$220.00', '+$40.00']);
  });
  it('opens saved purchases and shows screenshot-style position values and gain percentage', () => {
    const fixture = TestBed.createComponent(HoldingsTable);
    const purchases = [
      { fillId: 'second', acquiredAt: '2024-08-14T12:00:00Z', quantity: 1, pricePaid: 198.20, totalCost: 198.20 },
      { fillId: 'first', acquiredAt: '2024-07-23T12:00:00Z', quantity: 1, pricePaid: 190.42, totalCost: 190.42 },
    ];
    fixture.componentRef.setInput('assets', [{ ...holding, price: 301.54, cost: 194.31, purchases,
      quoteAsOf: '2026-10-14T12:00:00Z' }]);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.position-link').click();
    fixture.detectChanges();
    const details = fixture.nativeElement.querySelector('.position-details');
    expect(details.textContent).toContain('$603.08');
    expect(details.textContent).toContain('$194.31');
    expect(details.textContent).toContain('$388.62');
    expect(details.textContent).toContain('+$214.46');
    expect(details.textContent).toContain('+55.19%');
    const rows = details.querySelectorAll(':scope > table > tbody > tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('$198.20');
    expect(rows[1].textContent).toContain('$190.42');
    fixture.componentRef.setInput('assets', [{ ...holding, price: 302, cost: 194.31, purchases }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.position-details').textContent).toContain('$604.00');
    expect(fixture.nativeElement.querySelector('.position-details').textContent).toContain('$194.31');
  });
  it('shows unavailable data without inventing zero purchase cost or a loss', () => {
    const fixture = TestBed.createComponent(HoldingsTable);
    fixture.componentRef.setInput('assets', [{ ...holding, cost: 0, costKnown: false, price: 0 }]);
    fixture.detectChanges();
    const values = [...fixture.nativeElement.querySelectorAll('tbody td')].map((cell: any) => cell.textContent.trim());
    expect(values.slice(2, 6)).toEqual(['—', '—', '—', '—']);
  });
});
