import { Routes } from "@angular/router";
import { OrdersPage } from "./pages/orders/orders";
import { ClientsPage } from "./pages/clients/clients";
import { DisputesPage } from "./pages/disputes/disputes";
import { ActionsPage } from "./pages/actions/actions";
import { ReportsPage } from "./pages/reports/reports";
import { StaffPage } from "./pages/staff/staff";
export const routes: Routes = [
  { path: "admin.html", redirectTo: "admin", pathMatch: "full" },
  { path: "analyst.html", redirectTo: "analyst", pathMatch: "full" },
  {
    path: "admin",
    children: [
      { path: "", component: OrdersPage },
      { path: "orders", component: OrdersPage },
      { path: "clients", component: ClientsPage },
      { path: "disputes", component: DisputesPage },
      { path: "actions", component: ActionsPage },
      { path: "staff", component: StaffPage },
      { path: "reports", component: ReportsPage },
    ],
  },
  {
    path: "analyst",
    children: [
      { path: "", component: ReportsPage },
      { path: "reports", component: ReportsPage },
    ],
  },
  { path: "**", redirectTo: "admin" },
];
