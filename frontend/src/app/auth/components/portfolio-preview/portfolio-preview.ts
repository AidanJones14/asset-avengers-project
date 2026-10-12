import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AllocationChart } from '../../../shared/components/allocation-chart/allocation-chart';
import { PortfolioStore } from '../../../client/state/portfolio.store';

@Component({
  selector: 'app-portfolio-preview',
  imports: [AllocationChart, CommonModule],
  templateUrl: './portfolio-preview.html',
  styleUrl: './portfolio-preview.css',
})
export class PortfolioPreview {
  private readonly store = inject(PortfolioStore);

  readonly slide = signal(0);
  readonly range = signal(1);
  readonly titles = ['Your bigger picture', 'A balanced perspective', 'Your next opportunity'];
  readonly captions = ['Track your progress over time.', 'See how your portfolio is spread.', 'Keep your favorite stocks in sight.'];
  readonly ranges = [
    { label: '1W', change: '+1.24%', points: [103, 89, 97, 70, 78, 62, 48, 58, 36, 41, 25] },
    { label: '1M', change: '+3.00%', points: [118, 110, 114, 94, 100, 80, 87, 59, 66, 45, 54, 32, 38, 17, 24, 10] },
    { label: '1Y', change: '+7.09%', points: [125, 115, 122, 101, 88, 99, 70, 82, 62, 48, 60, 34, 42, 22, 10] },
  ];
  readonly line = computed(() => this.ranges[this.range()].points.map((y, i, a) => `${i ? 'L' : 'M'}${i * 360 / (a.length - 1)} ${y}`).join(' '));
  readonly holdings = [
    { name: 'Technology', value: 48, color: '#b3f568' },
    { name: 'Consumer', value: 29, color: '#80bca3' },
    { name: 'Cash', value: 23, color: '#647b88' },
  ];

  /** Display the top 3 assets with real prices from the portfolio store */
  readonly stocks = computed(() =>
    this.store.assets()
      .slice(0, 3)
      .map(asset => ({
        symbol: asset.symbol,
        name: asset.name,
        price: `$${asset.price.toFixed(2)}`,
        change: `${asset.change >= 0 ? '+' : ''}${asset.change.toFixed(2)}%`
      }))
  );

  move(direction: number) {
    this.slide.update(value => (value + direction + this.titles.length) % this.titles.length);
  }
}
