import { investmentAccount } from "../../shared";
import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { embedDashboard } from "@superset-ui/embedded-sdk";
import { Page, Row, Column, DataTable, time, money } from "../../shared";
import { ReportState } from "../../report-state";
@Component({
  selector: "staff-reports",
  imports: [FormsModule, DataTable],
  templateUrl: "./reports.html",
})
export class ReportsPage extends Page {
  readonly state = inject(ReportState);
  readonly time = time;
  readonly status = this.state.status;
  readonly reportTime = signal("19:00");
  readonly pdfDay = signal("");
  readonly dashboardKey = signal("");
  readonly currentCutoff = computed(
    () => this.status()["reportSchedule"]?.currentLocalTime || "19:00",
  );
  readonly queued = computed(
    () => this.status()["latestReportRequest"]?.status === "queued",
  );
  readonly manualStatus = computed(() => {
    const r = this.status()["latestReportRequest"];
    return !r
      ? "No manual report requested."
      : r.status === "published"
        ? `Report ready through ${time(r.cutoffAt)}. Download today's PDF or reopen a dashboard; chart caches may take 30 seconds to refresh.`
        : r.status === "failed"
          ? r.error || "Report generation failed. Try again."
          : `Queued through ${time(r.cutoffAt)}. Waiting for synchronization and the reporting worker.`;
  });
  readonly scheduleStatus = computed(() => {
    const s = this.status()["reportSchedule"];
    return s?.effectiveFrom
      ? `Today: ${this.currentCutoff()}. From ${s.effectiveFrom}: ${s.nextLocalTime} America/New_York. Applies to all staff; existing reports are preserved.`
      : "Changes take effect tomorrow; published reports keep their original cutoff.";
  });
  dirty = false;
  query = "";
  private timer?: ReturnType<typeof setTimeout>;
  private version = 0;
  private embedVersion = 0;
  readonly suggestions = signal<Row[]>([]);
  readonly nameMessage = signal("Type a name to see suggestions.");
  readonly activity = signal<Row[] | null>(null);
  readonly columns: Column[] = [
    {
      label: "Name",
      read: (r) =>
        r["fullName"] ||
        [r["firstName"], r["lastName"]].filter(Boolean).join(" "),
      action: (r) => this.choose(r),
    },
    { label: "Client ID", read: (r) => r["clientId"] },
  ];
  readonly activityColumns: Column[] = [
    { label: "Investment account", read: investmentAccount },
    { label: "Report date", read: (r) => r["reportDate"] },
    { label: "Trades", read: (r) => r["tradeCount"] },
    { label: "Traded amount", read: (r) => money(r["tradedNotional"]) },
  ];
  readonly accounts = signal<Row[]>([]);
  readonly accountColumns: Column[] = [
    { label: "Investment account", read: investmentAccount },
    { label: "Account ID", read: r => r["accountId"] },
    { label: "Status", read: r => r["isSuspended"] ? "Suspended" : "Active" },
  ];
  portfolioQuery = "";
  portfolioClass = "";
  readonly portfolios = signal<Row[] | null>(null);
  readonly portfolioColumns: Column[] = [
    { label: "Client", read: r => r["clientName"] },
    { label: "Class", read: r => r["portfolioClass"] || "Unclassified" },
    { label: "Portfolio value", read: r => r["portfolioValue"] == null ? "Unavailable" : money(r["portfolioValue"]) },
    { label: "Size band", read: r => r["portfolioSizeBand"] },
    { label: "Valuation", read: r => r["valuationStatus"] },
    { label: "Oldest quote", read: r => r["oldestQuoteAt"] || "No holdings quote" },
    { label: "Client ID", read: r => r["clientId"] },
  ];
  filterPortfolios() {
    return this.run("portfolios", async () => {
      const params = new URLSearchParams({q: this.portfolioQuery.trim(), portfolioClass: this.portfolioClass});
      this.portfolios.set(await this.read<Row[]>(`analytics/clients/portfolios?${params}`));
    });
  }
  readonly workspaceUrl = signal("");
  readonly workspaceHelp = signal("Loading Superset workspace…");
  private async loadWorkspace() {
    try {
      const workspace = await this.read<{ssoUrl: string}>("analytics/workspace");
      const url = new URL(workspace.ssoUrl);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Invalid workspace address");
      this.workspaceUrl.set(url.href);
      this.workspaceHelp.set("Create joins, charts and dashboards using your J.A.R.V.I.S. sign-in.");
    } catch { if (!this.destroyed) this.workspaceHelp.set("Superset workspace link is unavailable. Sign in again or check the staff API configuration."); }
  }
  openWorkspace() {
    const tab = window.open("about:blank", "_blank");
    if (!tab) { this.feedback.message.set("Allow popups to open the Superset workspace."); return; }
    tab.opener = null;
    tab.document.body.textContent = "Opening your analytics workspace…";
    return this.run("workspace", async () => {
      try {
        const revision = this.api.revision;
        const url = new URL(this.workspaceUrl());
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Invalid workspace address");
        const result = await this.api.supersetTicket();
        if (this.destroyed || revision !== this.api.revision) throw new DOMException("Session changed", "AbortError");
        if (tab.closed) return;
        const form = tab.document.createElement("form");
        form.method = "POST"; form.action = url.href;
        const input = tab.document.createElement("input");
        input.type = "hidden"; input.name = "ticket"; input.value = result.ticket;
        form.append(input); tab.document.body.replaceChildren(form); form.submit();
      } catch (error) { tab.close(); throw error; }
    });
  }
  readonly dashboardStatus = signal(
    "Choose a dashboard to load its published data.",
  );
  private readonly mount =
    viewChild<ElementRef<HTMLDivElement>>("dashboardMount");
  private embedded: { unmount: () => void } | null = null;
  constructor() {
    super();
    if (this.api.claims()?.roles.includes("ANALYST")) void this.loadWorkspace();
    effect(() => {
      const status = this.status();
      if (!this.dirty)
        this.reportTime.set(
          status["reportSchedule"]?.nextLocalTime ||
            status["reportSchedule"]?.currentLocalTime ||
            "19:00",
        );
      if (!this.pdfDay() && status["latestPublishedBatch"]?.reportDate)
        this.pdfDay.set(status["latestPublishedBatch"].reportDate);
    });
    effect(() => {
      const entries = this.state.dashboards();
      if (!entries.some((e) => e["dashboardKey"] === this.dashboardKey()))
        this.dashboardKey.set(entries[0]?.["dashboardKey"] || "");
    });
    inject(DestroyRef).onDestroy(() => this.closeDashboard());
  }
  saveSchedule() {
    this.run("schedule", async () => {
      if (
        !/^\d{2}:\d{2}$/.test(this.reportTime()) ||
        this.reportTime() === "00:00"
      )
        throw new Error("Choose a report time between 00:01 and 23:59.");
      const schedule = await this.read("analytics/report-schedule", {
        method: "PUT",
        body: { localTime: this.reportTime() },
      });
      this.dirty = false;
      this.state.status.update((status) => ({
        ...status,
        reportSchedule: schedule,
      }));
    });
  }
  generate() {
    this.run("generate-report", async () => {
      await this.read("analytics/report-requests", {
        method: "POST",
        body: {},
      });
      await this.state.refresh();
    });
  }
  exportReport() {
    this.run("report-pdf", () => {
      if (!this.pdfDay()) throw new Error("Choose a report date.");
      return this.download(
        `analytics/reports/${encodeURIComponent(this.pdfDay())}/pdf`,
        `report-${this.pdfDay()}.pdf`,
      );
    });
  }
  changed() {
    clearTimeout(this.timer);
    const version = ++this.version;
    this.suggestions.set([]);
    this.activity.set(null);
    this.accounts.set([]);
    const query = this.query.trim();
    this.nameMessage.set(
      query ? "Searching…" : "Type a name to see suggestions.",
    );
    if (!query) return;
    this.timer = this.later(() =>
      this.run(`names-${version}`, async () => {
        const rows = await this.read<Row[]>(
          `analytics/clients/suggestions?q=${encodeURIComponent(query)}`,
        );
        if (version !== this.version) return;
        this.suggestions.set(rows);
        this.nameMessage.set(rows.length ? "" : "No matching names found.");
      }),
    );
  }
  choose(row: Row) {
    const version = ++this.version;
    clearTimeout(this.timer);
    this.query = row["fullName"] || this.query;
    this.suggestions.set([]);
    this.nameMessage.set("");
    this.activity.set(null);
    this.accounts.set([]);
    this.run(`client-activity-${version}`, async () => {
      const [rows, accounts] = await Promise.all([
        this.read<Row[]>(`analytics/clients/${row["clientId"]}/activity`),
        this.read<Row[]>(`analytics/clients/${row["clientId"]}/accounts`),
      ]);
      if (version === this.version) { this.activity.set(rows); this.accounts.set(accounts); }
    });
  }
  private closeDashboard() {
    this.embedVersion++;
    this.embedded?.unmount();
    this.embedded = null;
    this.mount()?.nativeElement.replaceChildren();
  }
  openDashboard() {
    this.run("dashboard", async () => {
      const key = this.dashboardKey();
      if (!key) throw new Error("No dashboards are configured yet.");
      this.closeDashboard();
      const version = this.embedVersion;
      this.dashboardStatus.set("Loading dashboard…");
      try {
        const initial = await this.read(
          `analytics/dashboards/${encodeURIComponent(key)}/guest-token`,
          { method: "POST", body: {} },
        );
        if (version !== this.embedVersion) return;
        let first = true;
        const dashboard = await embedDashboard({
          id: initial.dashboardId,
          supersetDomain: initial.supersetUrl,
          mountPoint: this.mount()!.nativeElement,
          fetchGuestToken: async () => {
            if (this.destroyed || version !== this.embedVersion)
              throw new DOMException("Dashboard closed", "AbortError");
            if (first) {
              first = false;
              return initial.guestToken;
            }
            try {
              return (
                await this.read(
                  `analytics/dashboards/${encodeURIComponent(key)}/guest-token`,
                  { method: "POST", body: {} },
                )
              ).guestToken;
            } catch (error) {
              if (!this.destroyed)
                this.dashboardStatus.set(
                  "Dashboard access expired. Sign in or open the dashboard again.",
                );
              throw error;
            }
          },
          dashboardUiConfig: { hideTitle: true, filters: { expanded: true } },
          referrerPolicy: "strict-origin-when-cross-origin",
        });
        if (this.destroyed || version !== this.embedVersion) {
          dashboard.unmount();
          return;
        }
        this.embedded = dashboard;
        this.dashboardStatus.set(
          "Showing published report data. Use the dashboard filters to explore it.",
        );
      } catch (error) {
        if (!this.destroyed && version === this.embedVersion)
          this.dashboardStatus.set(
            "Dashboard could not load. Check report availability and try again.",
          );
        throw error;
      }
    });
  }
}
