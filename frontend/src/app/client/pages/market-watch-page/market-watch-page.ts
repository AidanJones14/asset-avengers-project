import { Component } from '@angular/core';
import { PageFrame } from '../../components/page-frame/page-frame';
import { MarketWatch } from '../../components/market-watch/market-watch';

@Component({
  selector: 'app-market-watch-page', imports: [PageFrame, MarketWatch],
  template: `<app-page-frame page="Market Watch"><app-market-watch [expanded]="true" /></app-page-frame>`,
})
export class MarketWatchPage {}
