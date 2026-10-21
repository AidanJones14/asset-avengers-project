import { investmentAccount } from "../../shared";
import { Component, inject, signal } from "@angular/core";
import { Router } from "@angular/router";
import { Page, Row, Column, DataTable, time, amount } from "../../shared";
@Component({
  selector: "staff-disputes",
  imports: [DataTable],
  templateUrl: "./disputes.html",
})
export class DisputesPage extends Page {
  private readonly router = inject(Router);
  readonly rows = signal<Row[]>([]);
  readonly loading = signal(false);
  readonly failed = signal(false);
  page = 0;
  private version = 0;
  readonly columns: Column[] = [
    { label: "Investment account", read: investmentAccount },
    { label: "Filed", read: (r) => time(r["createdAt"]) },
    {
      label: "Client",
      read: (r) => `${r["clientName"] || r["email"]} · ${r["email"]}`,
    },
    { label: "Category", read: (r) => r["category"] },
    {
      label: "Related order",
      read: (r) =>
        r["orderId"]
          ? `${r["side"]} ${amount(r["quantity"])} ${r["symbol"]} · ${time(r["orderDate"])}`
          : "General account issue",
      canAct: (r) => !!r["orderId"],
      action: (r) => {
        if (r["orderId"])
          void this.router.navigate(["/admin/orders"], {
            queryParams: { order: r["orderId"] },
          });
      },
    },
    { label: "Details", read: (r) => r["description"] },
    { label: "Status", read: (r) => String(r["status"]).replaceAll("_", " ") },
  ];
  constructor() {
    super();
    this.refresh();
  }
  refresh(page = 0) {
    this.run("disputes", async () => {
      const version = ++this.version;
      this.loading.set(true);
      this.failed.set(false);
      try {
        const rows = await this.read<Row[]>(`admin/disputes?page=${page}`);
        if (version !== this.version) return;
        this.rows.set(rows);
        this.page = page;
      } catch (error) {
        if (version === this.version) this.failed.set(true);
        throw error;
      } finally {
        if (version === this.version) this.loading.set(false);
      }
    });
  }
}
