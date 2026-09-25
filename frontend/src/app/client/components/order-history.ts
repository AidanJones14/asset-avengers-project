import { Component, input, output } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { Order } from '../../portfolio.store';
@Component({
  selector: 'app-order-history',
  imports: [CurrencyPipe],
  templateUrl: './order-history.html',
  styles: ':host { display: block; min-width: 0; }',
})
export class OrderHistory {
  readonly orders = input.required<Order[]>();
  readonly trade = output<void>();
}
