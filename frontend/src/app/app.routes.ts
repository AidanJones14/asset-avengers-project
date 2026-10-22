/**
 * Client navigation only; the staff console is served separately on port 8086.
 * The role guard improves navigation, while Spring enforces authorization and ownership.
 */

import { Routes } from '@angular/router';
import { AuthPage } from './auth/pages/auth-page/auth-page';
import { requireInvestmentAccount, requireRole } from './auth/auth.guard';
import { ClientLayout } from './client/layout/client-layout';
import { OverviewPage } from './client/pages/overview-page/overview-page';
import { PortfolioPage } from './client/pages/portfolio-page/portfolio-page';
import { OrdersPage } from './client/pages/orders-page/orders-page';
import { BankAccountsPageComponent } from './client/pages/bank-accounts-page/bank-accounts-page';
import { ProfilePage } from './client/pages/profile-page/profile-page';
import { MarketWatchPage } from './client/pages/market-watch-page/market-watch-page';
import { StockSearchPage } from './client/pages/stock-search-page/stock-search-page';
import { LearnPage } from './client/pages/learn-page/learn-page';
import { LearnOverview } from './client/pages/learn-page/overview/learn-overview';
import { VideoLibrary } from './client/pages/learn-page/library/video-library';
import { AccountsPage } from './client/pages/accounts-page/accounts-page';
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'login', component: AuthPage, title: 'Log in | Endgame', data: { signup: false } },
  {
    path: 'signup',
    component: AuthPage,
    title: 'Sign up | Endgame',
    data: { signup: true },
  },
  {
    path: 'client',
    component: ClientLayout,
    canActivate: [requireRole('CLIENT')],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'accounts' },
      { path: 'accounts', component: AccountsPage, title: 'Your Accounts | Endgame' },
      { path: 'overview', component: OverviewPage, title: 'Accounts Dashboard | Endgame' },
      { path: 'portfolio', component: PortfolioPage, canActivate: [requireInvestmentAccount], title: 'Portfolio | Endgame' },
      { path: 'orders', component: OrdersPage, canActivate: [requireInvestmentAccount], title: 'Orders | Endgame' },
      { path: 'bank-accounts', component: BankAccountsPageComponent, title: 'Bank Accounts | Endgame' },
      { path: 'profile', component: ProfilePage, title: 'Profile | Endgame' },
      { path: 'market-watch', component: MarketWatchPage, title: 'Market Watch | Endgame' },
      { path: 'stock-search', component: StockSearchPage, title: 'Search Stocks | Endgame' },
      {
        path: 'learn',
        component: LearnPage,
        children: [
          { path: '', component: LearnOverview, title: 'Learn | Endgame' },
          { path: 'videos', component: VideoLibrary, title: 'Video library | Endgame' },
        ],
      },
    ],
  },
  { path: '**', redirectTo: 'client/accounts' },
];
