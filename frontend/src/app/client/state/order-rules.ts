/**
 * Browser-side mirror of the server's order-type price rules, used for quick feedback
 * in the trade dialog and order edits. The server remains the authority and revalidates.
 */

import { OrderType } from '../../api/orders/order';
import { Side } from './portfolio.store';

export const ORDER_TYPES: readonly { value: OrderType; label: string }[] = [
  { value: 'market', label: 'Market' },
  { value: 'limit', label: 'Limit' },
  { value: 'stop', label: 'Stop' },
  { value: 'stop_limit', label: 'Stop limit' },
];

export const orderTypeLabel = (type: OrderType | undefined) =>
  ORDER_TYPES.find(option => option.value === type)?.label ?? 'Market';

export const usesLimit = (type: OrderType) => type === 'limit' || type === 'stop_limit';
export const usesStop = (type: OrderType) => type === 'stop' || type === 'stop_limit';

/** When the order executes, phrased for the client; mirrors OrderExecutionService. */
export function orderTypeDescription(type: OrderType, side: Side): string {
  const buy = side === 'buy';
  switch (type) {
    case 'market':
      return buy ? 'Executes at the next available ask.' : 'Executes at the next available bid.';
    case 'limit':
      return buy
        ? 'Executes only when the ask is at or below your limit price. Cash for the full limit amount is reserved until it fills or you cancel.'
        : 'Executes only when the bid is at or above your limit price.';
    case 'stop':
      return buy
        ? 'Waits until the ask rises to your stop price, then executes at the current ask.'
        : 'Waits until the bid falls to your stop price, then executes at the current bid.';
    case 'stop_limit':
      return buy
        ? 'When the ask rises to your stop price, it becomes a limit order that executes only at or below your limit price.'
        : 'When the bid falls to your stop price, it becomes a limit order that executes only at or above your limit price.';
  }
}

function priceFieldError(value: number | null | undefined, field: string): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return `Enter a ${field} greater than $0.`;
  // Matches the NUMERIC(18,4) columns; the server rejects rather than rounds extra places.
  if (Math.round(value * 10_000) / 10_000 !== value) return `The ${field} can have at most 4 decimal places.`;
  if (value > 99_999_999_999_999) return `The ${field} is too large.`;
  return '';
}

/** Returns a readable error for the prices this order type needs, or '' when valid. */
export function orderPriceError(type: OrderType, side: Side, limitPrice: number | null, stopPrice: number | null): string {
  const stopError = usesStop(type) ? priceFieldError(stopPrice, 'stop price') : '';
  if (stopError) return stopError;
  const limitError = usesLimit(type) ? priceFieldError(limitPrice, 'limit price') : '';
  if (limitError) return limitError;
  if (type === 'stop_limit') {
    if (side === 'buy' && limitPrice! < stopPrice!) return 'For a buy stop limit, the limit price must be at or above the stop price.';
    if (side === 'sell' && limitPrice! > stopPrice!) return 'For a sell stop limit, the limit price must be at or below the stop price.';
  }
  return '';
}
