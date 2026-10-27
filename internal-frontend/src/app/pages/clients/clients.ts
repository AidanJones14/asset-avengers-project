import { investmentAccount } from "../../shared";
import {
  Component,
  ElementRef,
  viewChild,
  computed,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import {
  Page,
  Row,
  Column,
  DataTable,
  Facts,
  money,
  amount,
  time,
} from "../../shared";
@Component({
  selector: "staff-clients",
  imports: [FormsModule, DataTable, Facts],
  templateUrl: "./clients.html",
})
export class ClientsPage extends Page {
  private readonly detailElement =
    viewChild<ElementRef<HTMLElement>>("accountDetail");
  query = "";
  private searched = "";
  page = 0;
  private version = 0;
  private detailVersion = 0;
  private timer?: ReturnType<typeof setTimeout>;
  readonly rows = signal<Row[]>([]);
  readonly pagination = signal<Row>({});
  readonly loading = signal(false);
  readonly message = signal("Search for a client to inspect their account.");
  readonly detail = signal<Row | null>(null);
  readonly columns: Column[] = [
    {
      label: "Client",
      read: (r) => r["email"] || r["clientId"],
      action: (r) => this.select(r["accountId"]),
    },
    { label: "Investment account", read: investmentAccount },
    { label: "Account ID", read: (r) => r["accountId"] },
    { label: "Cash", read: (r) => money(r["cashBalance"]) },
    { label: "Suspended", read: (r) => (r["suspended"] ? "Yes" : "No") },
    { label: "Positions", read: (r) => r["openPositions"] },
  ];
  readonly positionColumns: Column[] = [
    { label: "Symbol", read: (r) => r["symbol"] },
    { label: "Name", read: (r) => r["instrumentName"] },
    { label: "Quantity", read: (r) => amount(r["quantity"]) },
  ];
  readonly cashColumns: Column[] = [
    { label: "Occurred", read: (r) => time(r["occurredAt"]) },
    { label: "Type", read: (r) => r["changeType"] },
    { label: "Symbol", read: (r) => r["symbol"] },
    { label: "Cash change", read: (r) => money(r["cashDelta"]) },
    { label: "Holding change", read: (r) => amount(r["holdingDelta"]) },
  ];
  readonly facts = computed<[string, unknown][]>(() => {
    const a = this.detail()?.["account"];
    return a
      ? [
          ["Email", a.email],
          ["Account ID", a.accountId],
          ["Investment account", investmentAccount(a)],
          ["Client ID", a.clientId],
          ["Cash", money(a.cashBalance)],
          ["Suspended", a.suspended ? "Yes" : "No"],
          ["As of", time(a.asOf)],
        ]
      : [];
  });
  changed() {
    clearTimeout(this.timer);
    this.version++;
    this.rows.set([]);
    this.pagination.set({});
    this.loading.set(false);
    const query = this.query.trim();
    this.message.set(
      query.length >= 3
        ? "Searching…"
        : query
          ? "Enter at least 3 characters to search."
          : "Search for a client to inspect their account.",
    );
    if (query.length >= 3) this.timer = this.later(() => this.submit());
  }
  submit() {
    clearTimeout(this.timer);
    const query = this.query.trim();
    if (query.length < 3) {
      this.changed();
      return;
    }
    this.searched = query;
    this.run(`clients-${this.version}`, () => this.search(0));
  }
  async search(page: number) {
    const version = ++this.version;
    this.loading.set(true);
    this.message.set("Searching…");
    try {
      const result = await this.read(
        `admin/clients?${new URLSearchParams({ q: this.searched, page: String(page), size: "20" })}`,
      );
      if (version !== this.version) return;
      this.rows.set(result.items);
      this.pagination.set(result.page);
      this.page = page;
      this.message.set("");
    } catch (error) {
      if (version === this.version)
        this.message.set("Could not load results. Try the search again.");
      throw error;
    } finally {
      if (version === this.version) this.loading.set(false);
    }
  }
  turn(delta: number) {
    this.run("clients", () => this.search(this.page + delta));
  }
  select(id: string) {
    this.run(`account-${id}`, async () => {
      const version = ++this.detailVersion;
      this.detail.set(null);
      const result = await this.read(`admin/accounts/${id}`);
      if (version === this.detailVersion) {
        this.detail.set(result);
        this.reveal(() => this.detailElement());
      }
    });
  }
}
