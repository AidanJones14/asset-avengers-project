import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OrderHistory } from './order-history';

describe('OrderHistory', () => {
  let fixture: ComponentFixture<OrderHistory>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [OrderHistory] }).compileComponents();
    fixture = TestBed.createComponent(OrderHistory);
  });

  it('shows each order’s account in the table and expanded details', () => {
    fixture.componentRef.setInput('accounts', [{ accountId: 'retirement', accountName: 'Retirement savings' }]);
    fixture.componentRef.setInput('orders', [
      { id: 'one', accountId: 'retirement', symbol: 'AAPL', side: 'buy', quantity: 1, total: 100, status: 'filled' },
      { id: 'two', accountId: 'unknown-account', symbol: 'MSFT', side: 'buy', quantity: 1, total: 100, status: 'filled' },
    ]);
    fixture.detectChanges();
    const rows = fixture.nativeElement.querySelectorAll('tbody tr');
    expect(rows[0].cells[1].textContent).toContain('Retirement savings');
    expect(rows[1].cells[1].textContent).toContain('unknown-account');
    fixture.nativeElement.querySelector('.details-button').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.order-details').textContent).toContain('Retirement savings');
    expect(fixture.nativeElement.querySelector('.edit-row td').colSpan).toBe(7);
  });

  it('explains fills and retains rejection reasons after returning to order history', () => {
    fixture.componentRef.setInput('orders',[
      {id:'filled',symbol:'AAPL',side:'buy',quantity:2,total:200,status:'filled',executionPrice:100,finalizedAt:'2026-10-20T12:00:00Z'},
      {id:'rejected',symbol:'MSFT',side:'buy',quantity:1,total:null,status:'rejected',rejectionReason:'Insufficient available cash'},
    ]);
    fixture.detectChanges();
    const buttons=fixture.nativeElement.querySelectorAll('.details-button');buttons[0].click();fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Execution price per share');
    expect(fixture.nativeElement.textContent).toContain('Executed at');
    expect(fixture.nativeElement.textContent).toContain('Total paid');
    buttons[1].click();fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Insufficient available cash');
    expect(fixture.nativeElement.textContent).toContain('Not executed');
  });

  it('emits cancellation only for open persisted orders', () => {
    fixture.componentRef.setInput('orders', [
      { id: 'order-1', symbol: 'AAPL', side: 'buy', quantity: 2, total: null, status: 'submitted' },
      { id: 'order-2', symbol: 'MSFT', side: 'buy', quantity: 1, total: 425.52, status: 'filled' },
      { id: 'order-3', symbol: 'NVDA', side: 'buy', quantity: 1, total: null, status: 'accepted', type: 'limit', limitPrice: 90 },
    ]);
    const emitted: string[] = [];
    fixture.componentInstance.cancelOrder.subscribe(id => emitted.push(id));
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const buttons = root.querySelectorAll<HTMLButtonElement>('.cancel-order');
    expect(buttons.length).toBe(2);
    buttons[0].click();
    buttons[1].click();
    expect(emitted).toEqual(['order-1', 'order-3']);
  });

  it('shows order types, prices and stop status', () => {
    fixture.componentRef.setInput('orders', [
      { id: 'a', symbol: 'AAPL', side: 'buy', quantity: 1, total: null, status: 'accepted', type: 'stop_limit',
        stopPrice: 101, limitPrice: 102.5, stopTriggered: false },
      { id: 'b', symbol: 'MSFT', side: 'sell', quantity: 1, total: null, status: 'accepted', type: 'stop_limit',
        stopPrice: 99, limitPrice: 98, stopTriggered: true },
      { id: 'c', symbol: 'NVDA', side: 'buy', quantity: 1, total: null, status: 'accepted', type: 'limit', limitPrice: 90 },
    ]);
    fixture.detectChanges();
    const rows = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr'))
      .map(row => row.textContent!.replace(/\s+/g, ' '));
    expect(rows[0]).toContain('Stop limit');
    expect(rows[0]).toContain('Stop $101.00 · Limit $102.50');
    expect(rows[0]).toContain('Waiting for stop');
    expect(rows[1]).toContain('Stop triggered');
    expect(rows[2]).toContain('Limit $90.00');
    expect(rows[2]).toContain('Open');
  });

  it('edits only changed prices and keeps a triggered stop fixed', () => {
    const changes: unknown[] = [];
    fixture.componentInstance.updatePrices.subscribe(change => changes.push(change));
    const triggered = { id: 'b', symbol: 'MSFT', side: 'sell' as const, quantity: 1, total: null, status: 'accepted',
      type: 'stop_limit' as const, stopPrice: 99, limitPrice: 98, stopTriggered: true };
    fixture.componentRef.setInput('orders', [triggered]);
    fixture.detectChanges();
    const history = fixture.componentInstance;
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.edit-order')!.click();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[id^="edit-stop-"]')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('[id^="edit-limit-"]')).toBeTruthy();

    history.draftLimit = 100;
    history.saveEdit(triggered);
    expect(history.editError()).toContain('at or below the stop price');
    expect(changes).toEqual([]);

    history.draftLimit = 97.5;
    history.saveEdit(triggered);
    expect(changes).toEqual([{ orderId: 'b', prices: { limitPrice: 97.5 } }]);
    expect(history.editingOrderId()).toBeNull();
  });

  it('does not offer price edits for market orders', () => {
    fixture.componentRef.setInput('orders', [
      { id: 'm', symbol: 'AAPL', side: 'buy', quantity: 1, total: null, status: 'accepted', type: 'market' },
    ]);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.edit-order')).toBeNull();
    expect(root.querySelector('.cancel-order')).toBeTruthy();
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
