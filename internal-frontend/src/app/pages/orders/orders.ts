import { easternDateTime } from "../../eastern-time";
import { investmentAccount } from "../../shared";
import {
  Component,
  ElementRef,
  viewChild,
  computed,
  inject,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  Page,
  Row,
  Column,
  DataTable,
  Facts,
  time,
  money,
  amount,
  uuid,
} from "../../shared";
@Component({
  selector: "staff-orders",
  imports: [FormsModule, DataTable, Facts],
  templateUrl: "./orders.html",
})
export class OrdersPage extends Page {
  private readonly detailElement =
    viewChild<ElementRef<HTMLElement>>("orderDetail");
  readonly rows = signal<Row[]>([]);
  readonly pagination = signal<Row>({});
  readonly loading = signal(false);
  readonly failed = signal(false);
  readonly detail = signal<Row | null>(null);
  readonly liveStatus = signal(
    "Updates automatically every 3 seconds while visible.",
  );
  filters: Record<string, string> = {
    symbol: "",
    status: "",
    orderId: "",
    clientId: "",
    fillId: "",
    instrumentId: "",
    from: "",
    to: "",
  };
  private params: Record<string, string> = {};
  page = 0;
  private version = 0;
  private detailVersion = 0;
  private pending = false;
  readonly time = time;
  readonly placedTime = time;
  readonly columns: Column[] = [
    { label: "Client", read: (r) => r["clientName"] || "Unknown client" },
    { label: "Investment account", read: investmentAccount },
    {
      label: "Order",
      read: (r) => r["orderId"],
      action: (r) => this.select(r["orderId"]),
    },
    { label: "Symbol", read: (r) => r["symbol"] },
    { label: "Side", read: (r) => r["orderSide"] },
    { label: "Quantity", read: (r) => amount(r["quantity"]) },
    { label: "Status", read: (r) => r["status"] },
    { label: "Order placed · date / time", read: (r) => this.placedTime(r["placedAt"]) },
  ];
  readonly pricingColumns: Column[] = [
    { label: "Phase", read: (r) => r["phase"] },
    { label: "Decision", read: (r) => r["decision"] },
    { label: "Bid", read: (r) => amount(r["quote"]?.bid) },
    { label: "Ask", read: (r) => amount(r["quote"]?.ask) },
    { label: "Provider time", read: (r) => time(r["quote"]?.asOf) },
    { label: "Observed", read: (r) => time(r["observedAt"]) },
    {
      label: "Stale",
      read: (r) =>
        r["quote"]?.stale == null ? "Unknown" : r["quote"].stale ? "Yes" : "No",
    },
    { label: "Reason", read: (r) => r["reason"] },
  ];
  readonly facts = computed<[string, unknown][]>(() => {
    const order = this.detail()?.["order"];
    return order
      ? [
          ["Client", order.clientName || "Unknown client"],
          ["Client ID", order.clientId],
          ["Investment account", investmentAccount(order)],
          ["Order ID", order.orderId],
          ["Order placed · date / time", this.placedTime(order.placedAt)],
          ["Instrument", order.symbol],
          ["Status", order.status],
          ["Side / quantity", `${order.orderSide} / ${amount(order.quantity)}`],
          ["Cash movement", money(order.cashChange)],
          ["Account ID", order.accountId],
        ]
      : [];
  });
  readonly json = computed(() =>
    this.detail() ? JSON.stringify(this.detail(), null, 2) : "",
  );
  constructor() {
    super();
    this.run("orders", () => this.search(0));
    this.poll();
    inject(ActivatedRoute)
      .queryParamMap.pipe(takeUntilDestroyed())
      .subscribe((params) => {
        const id = params.get("order");
        if (id) this.select(id);
      });
  }
  private poll() {
    this.later(async () => {
      if (!document.hidden && !this.pending) {
        try {
          await this.search(this.page, true);
          this.liveStatus.set(
            "Updates automatically every 3 seconds while visible. Copied trades can have a short synchronization delay.",
          );
        } catch {
          if (!this.destroyed)
            this.liveStatus.set("Updates delayed. Retrying automatically…");
        }
      }
      if (!this.destroyed) this.poll();
    }, 3000);
  }
  async search(page: number, background = false) {
    const version = ++this.version;
    this.pending = true;
    if (!background) {
      this.loading.set(true);
      this.failed.set(false);
    }
    try {
      const result = await this.read(
        `admin/trades?${new URLSearchParams({ ...this.params, page: String(page), size: "20" })}`,
      );
      if (version !== this.version) return;
      this.rows.set(result.items);
      this.pagination.set(result.page);
      this.page = page;
    } catch (error) {
      if (version === this.version && !background) this.failed.set(true);
      throw error;
    } finally {
      if (version === this.version) {
        this.pending = false;
        this.loading.set(false);
      }
    }
  }
  submit() {
    this.run("orders", async () => {
      const filters = Object.fromEntries(
        Object.entries(this.filters)
          .map(([key, value]) => [key, value.trim()])
          .filter(([, value]) => value),
      );
      for (const key of ["orderId", "clientId", "fillId", "instrumentId"])
        if (filters[key] && !uuid.test(filters[key]))
          throw new Error(`${key} must be a UUID.`);
      for (const key of ["from", "to"])
        if (filters[key]) filters[key] = easternDateTime(filters[key]).toISOString();
      this.params = filters;
      await this.search(0);
    });
  }
  reset() {
    for (const key of Object.keys(this.filters)) this.filters[key] = "";
    this.params = {};
    this.run("orders", () => this.search(0));
  }
  turn(delta: number) {
    this.run("orders", () => this.search(this.page + delta));
  }
  select(id: string) {
    this.run(`order-${id}`, () => this.open(id));
  }
  async open(id: string) {
    const version = ++this.detailVersion;
    this.detail.set(null);
    const [timeline, pricing] = await Promise.all([
      this.read(`admin/orders/${id}/timeline`),
      this.read(`admin/orders/${id}/pricing`),
    ]);
    if (version === this.detailVersion) {
      this.detail.set({ ...timeline, pricing });
      this.reveal(() => this.detailElement());
    }
  }
  export(pdf = false) {
    const id = this.detail()?.["order"]?.orderId;
    if (id)
      this.run("order-export", () =>
        this.download(
          `admin/orders/${id}/${pdf ? "pdf" : "export"}`,
          `order-${id}-audit.${pdf ? "pdf" : "json"}`,
        ),
      );
  }
}
