import { EasternDatePipe } from '../../../shared/pipes/eastern-date.pipe';
/**
 * Presents persisted order status and emits cancellation and price-change requests to
 * its parent. This table does not release or replace reservations itself; the server does.
 */

import { Component, input, output, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Order } from '../../state/portfolio.store';
import { orderPriceError, orderTypeLabel, usesLimit, usesStop } from '../../state/order-rules';
import { ClientAccount } from '../../../api/accounts/account';
import { UpdateOrderPricesRequest } from '../../../api/orders/order';

export interface OrderPriceChange {
  orderId: string;
  prices: UpdateOrderPricesRequest;
}

@Component({
  selector: 'app-order-history',
  imports: [EasternDatePipe, CurrencyPipe, FormsModule],
  templateUrl: './order-history.html',
  styles: `
    :host { display: block; min-width: 0; }
    .details-button { padding: 4px 8px; min-height: 30px; font-size: 12px; }
    .order-details { padding: 18px; background: var(--bg); border-radius: 10px; white-space: normal; }
    .order-details h3 { margin: 0 0 10px; font-size: 15px; }
    .order-details p { margin: 0 0 16px; line-height: 1.6; }
    .order-details dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 18px; margin: 0; }
    .order-details dt { color: var(--muted); font-size: 12px; margin-bottom: 6px; }
    .order-details dd { margin: 0; overflow-wrap: anywhere; font-size: 13px; }
    .order-time { display: block; margin-top: 6px; color: var(--muted); font-size: 11px; white-space: nowrap; }
    .order-status { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; }
    .order-actions { display: flex; gap: 6px; }
    .cancel-order, .edit-order { padding: 6px 10px; white-space: nowrap; }
    .order-prices { display: block; margin-top: 2px; }
    .edit-row td { height: auto; padding: 14px 0; }
    .edit-form { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px; white-space: normal; }
    .edit-form label { margin: 0 0 6px; font-size: 12px; }
    .edit-form input { width: 140px; padding: 8px 10px; }
    .edit-form .negative { flex-basis: 100%; margin: 0; font-size: 12px; }
  `,
})
export class OrderHistory {
  readonly orders = input.required<Order[]>();
  readonly accounts = input<ClientAccount[]>([]);

  accountName(order: Order): string {
    return this.accounts().find(account => account.accountId === order.accountId)?.accountName
      ?? order.accountId ?? 'Not recorded';
  }

  readonly cancellingOrderId = input<string | null>(null);
  readonly updatingOrderId = input<string | null>(null);
  readonly trade = output<void>();
  readonly cancelOrder = output<string>();
  readonly updatePrices = output<OrderPriceChange>();

  readonly typeLabel = orderTypeLabel;
  readonly usesLimit = usesLimit;
  readonly usesStop = usesStop;
  readonly detailsOrderId = signal<string | number | null>(null);
  toggleDetails(order: Order) { this.detailsOrderId.set(this.detailsOrderId() === order.id ? null : order.id); }
  outcomeDescription(order: Order): string {
    switch (order.status) {
      case 'filled': return 'Executed successfully. Your cash and holdings have been updated.';
      case 'rejected': return order.rejectionReason || 'This order was not executed. No rejection reason was recorded.';
      case 'cancelled': return 'Cancelled before execution. Any reserved cash or shares have been released.';
      case 'submitted': return 'Received and waiting to be processed.';
      case 'accepted': return order.type && order.type !== 'market' ? 'Accepted and waiting for the order conditions to be met.' : 'Accepted and waiting for execution.';
      default: return 'See the latest recorded order status.';
    }
  }
  readonly editingOrderId = signal<string | null>(null);
  readonly editError = signal('');
  draftLimit: number | null = null;
  draftStop: number | null = null;

  isOpen(order: Order): order is Order & { id: string } {
    return (order.status === 'submitted' || order.status === 'accepted') && typeof order.id === 'string';
  }

  /** Market orders have no price to change; a triggered stop can only change its limit. */
  canEdit(order: Order): boolean {
    return this.isOpen(order) && !!order.type && order.type !== 'market';
  }

  canEditStop(order: Order): boolean {
    return !!order.type && usesStop(order.type) && !order.stopTriggered;
  }

  statusLabel(order: Order): string {
    if (order.status === 'filled') return 'Fill';
    if (order.status === 'accepted' && order.type && order.type !== 'market') {
      if (usesStop(order.type) && !order.stopTriggered) return 'Waiting for stop';
      if (order.type === 'stop_limit') return 'Stop triggered';
      return 'Open';
    }
    return order.status.replace('_', ' ');
  }

  startEdit(order: Order): void {
    this.editingOrderId.set(order.id as string);
    this.editError.set('');
    this.draftLimit = order.limitPrice ?? null;
    this.draftStop = order.stopPrice ?? null;
  }

  stopEdit(): void {
    this.editingOrderId.set(null);
    this.editError.set('');
  }

  saveEdit(order: Order): void {
    if (!order.type || !this.isOpen(order)) return;
    const error = orderPriceError(order.type, order.side, this.draftLimit, this.draftStop);
    if (error) { this.editError.set(error); return; }
    const prices: UpdateOrderPricesRequest = {};
    if (usesLimit(order.type) && this.draftLimit !== order.limitPrice) prices.limitPrice = this.draftLimit!;
    if (this.canEditStop(order) && this.draftStop !== order.stopPrice) prices.stopPrice = this.draftStop!;
    if (prices.limitPrice !== undefined || prices.stopPrice !== undefined) {
      this.updatePrices.emit({ orderId: order.id, prices });
    }
    this.stopEdit();
  }
}
