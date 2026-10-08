import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OrderHistory } from './order-history';

describe('OrderHistory', () => {
  let fixture: ComponentFixture<OrderHistory>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [OrderHistory] }).compileComponents();
    fixture = TestBed.createComponent(OrderHistory);
  });

  it('emits cancellation only for submitted persisted orders', () => {
    fixture.componentRef.setInput('orders', [
      { id: 'order-1', symbol: 'AAPL', side: 'buy', quantity: 2, total: null, status: 'submitted' },
      { id: 'order-2', symbol: 'MSFT', side: 'buy', quantity: 1, total: 425.52, status: 'filled' },
    ]);
    const emitted: string[] = [];
    fixture.componentInstance.cancelOrder.subscribe(id => emitted.push(id));
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const buttons = root.querySelectorAll<HTMLButtonElement>('.cancel-order');
    expect(buttons.length).toBe(1);
    buttons[0].click();
    expect(emitted).toEqual(['order-1']);
  });

  it('disables the button while that order is being cancelled', () => {
    fixture.componentRef.setInput('orders', [
      { id: 'order-1', symbol: 'AAPL', side: 'buy', quantity: 2, total: null, status: 'submitted' },
    ]);
    fixture.componentRef.setInput('cancellingOrderId', 'order-1');
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const button = root.querySelector<HTMLButtonElement>('.cancel-order')!;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Cancelling...');
  });
});
