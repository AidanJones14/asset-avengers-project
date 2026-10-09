import { Routes } from '@angular/router';
import { AuthPage } from './auth/pages/auth-page/auth-page';
import { requireRole } from './auth/auth.guard';
import { ClientLayout } from './client/layout/client-layout';
import { OverviewPage } from './client/pages/overview-page/overview-page';
import { PortfolioPage } from './client/pages/portfolio-page/portfolio-page';
import { OrdersPage } from './client/pages/orders-page/orders-page';
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'login', component: AuthPage, title: 'Log in | Asset Avengers', data: { signup: false } },
  {
    path: 'signup',
    component: AuthPage,
    title: 'Sign up | Asset Avengers',
    data: { signup: true },
  },
  {
    path: 'client',
    component: ClientLayout,
    canActivate: [requireRole('CLIENT')],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'overview' },
      { path: 'overview', component: OverviewPage, title: 'Overview | Asset Avengers' },
      { path: 'portfolio', component: PortfolioPage, title: 'Portfolio | Asset Avengers' },
      { path: 'orders', component: OrdersPage, title: 'Orders | Asset Avengers' },
    ],
  },
  { path: '**', redirectTo: 'client/overview' },
];

