import { Side } from '../../client/state/portfolio.store';

export type OrderType = 'market' | 'limit' | 'stop' | 'stop_limit';
export type OrderStatus = 'submitted' | 'accepted' | 'partially_filled' | 'filled' | 'cancelled' | 'rejected';

export interface CreateOrderRequest {
  accountId: string;
  instrumentId?: string;
  symbol?: string;
  orderType: OrderType;
  orderSide: Side;
  quantity: number;
  limitPrice: number | null;
  stopPrice: number | null;
}

export interface ApiOrder extends Omit<CreateOrderRequest, 'instrumentId' | 'symbol'> {
  orderId: string;
  instrumentId: string;
  price: number | null;
  status: OrderStatus;
  submittedAt: string;
  updatedAt: string;
}
