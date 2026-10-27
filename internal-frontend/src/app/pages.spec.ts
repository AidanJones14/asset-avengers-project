import { ViewportScroller } from "@angular/common";
import { TestBed } from "@angular/core/testing";
import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { provideRouter, Router } from "@angular/router";
import { vi } from "vitest";
import { embedDashboard } from "@superset-ui/embedded-sdk";
vi.mock("@superset-ui/embedded-sdk", () => ({ embedDashboard: vi.fn() }));
import { App } from "./app";
import { StaffApi } from "./api";
import { OrdersPage } from "./pages/orders/orders";
import { ClientsPage } from "./pages/clients/clients";
import { ActionsPage } from "./pages/actions/actions";
import { DisputesPage } from "./pages/disputes/disputes";
import { ReportsPage } from "./pages/reports/reports";
import { StaffPage } from "./pages/staff/staff";
import { ReportState } from "./report-state";
import { DataTable } from "./shared";
import { routes } from "./routes";
const token = (role = "ADMIN") =>
  `header.${btoa(JSON.stringify({ sub: "staff", email: "staff@example.invalid", roles: [role] }))}.signature`;
const tick = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
const pageOf = (items: unknown[]) => ({
  items,
  page: { totalElements: items.length, totalPages: items.length ? 1 : 0 },
});
const accountId = "20000000-0000-0000-0000-000000000001";
describe("Angular staff workflows", () => {
  let http: HttpTestingController;
  let api: StaffApi;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: ViewportScroller, useValue: { scrollToPosition: vi.fn() } },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter(routes),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(StaffApi);
  });
  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });
  it.each([
    { role: "ADMIN", component: OrdersPage, count: 1, request: "/api/v1/admin/trades?" },
    { role: "ADMIN", component: ActionsPage, count: 4, request: "" },
    { role: "ADMIN", component: StaffPage, count: 1, request: "/auth/admin/staff" },
    { role: "SUPER_ADMIN", component: StaffPage, count: 1, request: "/auth/admin/staff" },
    { role: "ADMIN", component: ReportsPage, count: 2, request: "" },
    { role: "ANALYST", component: ReportsPage, count: 2, request: "/api/v1/analytics/workspace" },
  ])("applies polished dropdowns to $component.name for $role", async ({ role, component, count, request }) => {
    api.useToken(token(role));
    const fixture = TestBed.createComponent<OrdersPage | ActionsPage | StaffPage | ReportsPage>(component);
    if (request) {
      http.expectOne(req => req.urlWithParams.startsWith(request)).flush(
        component === OrdersPage ? pageOf([]) :
        component === StaffPage ? [] : { ssoUrl: "http://superset.test/endgame/sso" },
      );
    }
    await tick();
    fixture.detectChanges();
    const selects: NodeListOf<HTMLSelectElement> = fixture.nativeElement.querySelectorAll("select");
    expect(selects).toHaveLength(count);
    for (const select of selects) {
      expect(select.classList.contains("polished-select")).toBe(true);
      const value = select.value;
      select.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      fixture.detectChanges();
      expect(select.classList.contains("keyboard-navigation")).toBe(true);
      select.dispatchEvent(new Event("pointermove", { bubbles: true }));
      fixture.detectChanges();
      expect(select.classList.contains("keyboard-navigation")).toBe(false);
      expect(select.value).toBe(value);
    }
    fixture.destroy();
  });
  it("renders API content as text rather than executable HTML", () => {
    const fixture = TestBed.createComponent(DataTable);
    fixture.componentRef.setInput("columns", [
      { label: "Name", read: (row: any) => row.name },
    ]);
    fixture.componentRef.setInput("rows", [
      { name: "<img src=x onerror=alert(1)>" },
    ]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      "<img src=x onerror=alert(1)>",
    );
    expect(fixture.nativeElement.querySelector("img")).toBeNull();
  });
  it("retains filtered order rows during a polling error, recovers, and stops polling on destruction", async () => {
    vi.useFakeTimers();
    api.useToken(token());
    const fixture = TestBed.createComponent(OrdersPage);
    const page = fixture.componentInstance;
    http
      .expectOne((req) => req.url.startsWith("/api/v1/admin/trades?"))
      .flush(
        pageOf([{ orderId: "order", symbol: "AAPL", status: "accepted", placedAt: "2026-10-26T14:35:42Z" }]),
      );
    await tick();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Order placed · date / time");
    expect(fixture.nativeElement.textContent).toContain(page.placedTime("2026-10-26T14:35:42Z"));
    page.filters["symbol"] = "AAPL";
    page.submit();
    http
      .expectOne((req) => req.url.includes("symbol=AAPL"))
      .flush(
        pageOf([{ orderId: "order", symbol: "AAPL", status: "accepted" }]),
      );
    await tick();
    await vi.advanceTimersByTimeAsync(3000);
    http
      .expectOne((req) => req.url.includes("symbol=AAPL"))
      .flush({}, { status: 503, statusText: "Unavailable" });
    await tick();
    expect(page.rows()[0]["status"]).toBe("accepted");
    expect(page.liveStatus()).toContain("Updates delayed");
    await vi.advanceTimersByTimeAsync(3000);
    http
      .expectOne((req) => req.url.includes("symbol=AAPL"))
      .flush(pageOf([{ orderId: "order", symbol: "AAPL", status: "filled" }]));
    await tick();
    expect(page.rows()[0]["status"]).toBe("filled");
    fixture.destroy();
    await vi.advanceTimersByTimeAsync(4000);
    http.expectNone(() => true);
  });
  it("ignores old client searches and clears empty results while typing a newer query", async () => {
    vi.useFakeTimers();
    api.useToken(token());
    const fixture = TestBed.createComponent(ClientsPage);
    const page = fixture.componentInstance;
    page.query = "nobody";
    page.changed();
    await vi.advanceTimersByTimeAsync(250);
    const old = http.expectOne((req) => req.url.includes("q=nobody"));
    page.query = "cameron";
    page.changed();
    expect(page.message()).toBe("Searching…");
    await vi.advanceTimersByTimeAsync(250);
    http
      .expectOne((req) => req.url.includes("q=cameron"))
      .flush(pageOf([{ email: "cameron@example.invalid" }]));
    await tick();
    old.flush(pageOf([]));
    await tick();
    expect(page.rows()[0]["email"]).toBe("cameron@example.invalid");
    expect(page.message()).toBe("");
    page.query = "";
    page.changed();
    expect(page.message()).toContain("Search for a client");
    fixture.destroy();
  });
  it("requires a fresh account selection for administrative commands", async () => {
    vi.useFakeTimers();
    api.useToken(token());
    const fixture = TestBed.createComponent(ActionsPage);
    const page = fixture.componentInstance;
    page.query = "ca";
    page.changed();
    await vi.advanceTimersByTimeAsync(250);
    http
      .expectOne((req) => req.url.includes("admin/clients/suggestions"))
      .flush([
        {
          accountId,
          fullName: "Cameron",
          email: "one@example.invalid",
          suspended: false,
        },
      ]);
    await tick();
    page.choose(page.suggestions()[0]);
    page.reasonCategory = "Other";
    page.reason = "Verified identity";
    page.apply();
    const command = http.expectOne(
      `/api/v1/admin/accounts/${accountId}/suspend`,
    );
    expect(command.request.body).toEqual({ reason: "Verified identity" });
    command.flush({});
    await tick();
    expect(page.selected()?.["suspended"]).toBe(true);
    page.query = "car";
    page.changed();
    expect(page.selected()).toBeNull();
    expect(page.id).toBe("");
    page.resource = "instruments";
    page.reset();
    await vi.advanceTimersByTimeAsync(500);
    http.expectNone(() => true);
    fixture.destroy();
  });
  it("schedules a countdown without marking the account suspended", async () => {
    api.useToken(token());
    const fixture = TestBed.createComponent(ActionsPage);
    const page = fixture.componentInstance;
    page.choose({ accountId, fullName: "Cameron", suspended: false });
    page.reasonCategory = "Inactive account";
    page.reason = "Unused custom reason";
    page.suspensionTiming = "delay";
    page.suspensionHours = 1;
    page.suspensionMinutes = 2;
    page.suspensionSeconds = 3;
    const before = Date.now();
    page.apply();
    const request = http.expectOne(`/api/v1/admin/accounts/${accountId}/suspension-schedule`);
    expect(request.request.body.reason).toBe("Inactive account");
    const delay = Date.parse(request.request.body.suspendAt) - before;
    expect(delay).toBeGreaterThanOrEqual(3723000);
    expect(delay).toBeLessThan(3724000);
    request.flush({});
    await tick();
    expect(page.selected()?.['suspended']).toBe(false);
    expect(page.result()).toContain("Suspension scheduled");
    fixture.destroy();
  });
  it.each([["7:00pm", 19], ["12am", 0], ["12:00 PM", 12]])(
    "schedules an Eastern date with a simple AM/PM time: %s", async (input, hour) => {
      api.useToken(token());
      const fixture = TestBed.createComponent(ActionsPage);
      const page = fixture.componentInstance;
      page.choose({ accountId, fullName: "Cameron", suspended: false });
      page.reasonCategory = "Inactive account";
      page.suspensionTiming = "date";
      page.suspensionDate = "2099-12-01";
      page.suspensionTime = input;
      page.apply();
      const request = http.expectOne(`/api/v1/admin/accounts/${accountId}/suspension-schedule`);
      expect(request.request.body.suspendAt).toBe(new Date(Date.UTC(2099, 11, 1, hour + 5, 0, 0)).toISOString());
      request.flush({});
      await tick();
      expect(page.result()).toContain("Suspension scheduled");
      fixture.destroy();
    },
  );
  // Staff security D2–D4: offer only what auth-server allows; the password is shown once.
  it("offers staff roles and actions by the signed-in role and forgets the temporary password", async () => {
    // jsdom has no modal dialogs; the page only needs showModal to exist.
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true; };
    const row = (id: string, role: string) => ({ id, email: `${id}@example.invalid`, role, disabledAt: null });
    api.useToken(token("ADMIN"));
    const fixture = TestBed.createComponent(StaffPage);
    const page = fixture.componentInstance;
    http.expectOne("/auth/admin/staff").flush([row("staff", "ADMIN"), row("other", "ADMIN"), row("top", "SUPER_ADMIN"), row("new", "ANALYST")]);
    await tick();
    expect(page.roles()).toEqual([["ANALYST", "Analyst"]]);
    expect(page.accounts().map((r) => page.canManage(r))).toEqual([false, false, false, true]);
    fixture.destroy();
    api.useToken(token("SUPER_ADMIN"));
    const superFixture = TestBed.createComponent(StaffPage);
    const superPage = superFixture.componentInstance;
    superFixture.detectChanges();
    http.expectOne("/auth/admin/staff").flush([row("other", "ADMIN")]);
    await tick();
    expect(superPage.roles().map((r) => r[0])).toEqual(["ANALYST", "ADMIN"]);
    expect(superPage.canManage(superPage.accounts()[0])).toBe(true);
    Object.assign(superPage, { role: "ADMIN", email: " nora@example.invalid ", firstName: "Nora", lastName: "Admin" });
    superPage.create();
    const created = http.expectOne("/auth/admin/staff/admins");
    // The route carries the role; the body never does.
    expect(created.request.body).toEqual({ email: "nora@example.invalid", firstName: "Nora", lastName: "Admin" });
    created.flush({ id: "nora", email: "nora@example.invalid", role: "ADMIN", temporaryPassword: "shown-once" }, { status: 201, statusText: "Created" });
    await tick();
    expect(superPage.created()?.temporaryPassword).toBe("shown-once");
    expect(superPage.accounts().at(-1)).toMatchObject({ id: "nora", passwordChangeRequired: true });
    superPage.closed();
    expect(superPage.created()).toBeNull();
    superFixture.destroy();
  });
  it("navigates from a dispute to its related order route", async () => {
    api.useToken(token());
    const fixture = TestBed.createComponent(DisputesPage);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, "navigate").mockResolvedValue(true);
    http.expectOne("/api/v1/admin/disputes?page=0").flush([
      {
        orderId: "order",
        description: "Investigate <script>literal</script>",
      },
    ]);
    await tick();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      "<script>literal</script>",
    );
    fixture.componentInstance.columns.find(c => c.label === "Related order")!.action!({ orderId: "order" });
    expect(navigate).toHaveBeenCalledWith(["/admin/orders"], {
      queryParams: { order: "order" },
    });
    fixture.destroy();
  });
  it("preserves unsaved report-time edits and saves a shared next-day schedule", async () => {
    api.useToken(token("ANALYST"));
    const state = TestBed.inject(ReportState);
    state.status.set({ reportSchedule: { currentLocalTime: "19:00" } });
    const fixture = TestBed.createComponent(ReportsPage);
    http.expectOne("/api/v1/analytics/workspace").flush({ ssoUrl: "http://superset.test/endgame/sso" });
    fixture.detectChanges();
    const page = fixture.componentInstance;
    page.reportTime.set("17:30");
    page.dirty = true;
    state.status.set({ reportSchedule: { currentLocalTime: "19:00" } });
    fixture.detectChanges();
    expect(page.reportTime()).toBe("17:30");
    page.saveSchedule();
    const save = http.expectOne("/api/v1/analytics/report-schedule");
    expect(save.request.body).toEqual({ localTime: "17:30" });
    save.flush({
      currentLocalTime: "19:00",
      nextLocalTime: "17:30",
      effectiveFrom: "2026-10-22",
    });
    await tick();
    fixture.detectChanges();
    expect(page.scheduleStatus()).toContain("From 2026-10-22: 17:30");
    expect(page.currentCutoff()).toBe("19:00");
    fixture.destroy();
  });
  it("defaults to Client activity and preserves an explicit dashboard selection", () => {
    api.useToken(token("ANALYST"));
    const state = TestBed.inject(ReportState);
    state.dashboards.set([
      { dashboardKey: "business-overview", title: "Business overview" },
      { dashboardKey: "client-activity", title: "Client activity" },
    ]);
    const fixture = TestBed.createComponent(ReportsPage);
    http.expectOne("/api/v1/analytics/workspace").flush({ ssoUrl: "http://superset.test/endgame/sso" });
    fixture.detectChanges();
    expect(fixture.componentInstance.dashboardKey()).toBe("client-activity");
    fixture.componentInstance.dashboardKey.set("business-overview");
    state.dashboards.set([...state.dashboards()]);
    fixture.detectChanges();
    expect(fixture.componentInstance.dashboardKey()).toBe("business-overview");
    fixture.destroy();
  });
  it("uses guest tokens for embedding and unmounts the dashboard when leaving reports", async () => {
    api.useToken(token("ANALYST"));
    const state = TestBed.inject(ReportState);
    state.dashboards.set([{ dashboardKey: "overview", title: "Overview" }]);
    const unmount = vi.fn();
    vi.mocked(embedDashboard).mockResolvedValue({
      unmount,
    } as unknown as Awaited<ReturnType<typeof embedDashboard>>);
    const fixture = TestBed.createComponent(ReportsPage);
    http.expectOne("/api/v1/analytics/workspace").flush({ ssoUrl: "http://superset.test/endgame/sso" });
    fixture.detectChanges();
    const page = fixture.componentInstance;
    page.openDashboard();
    http.expectOne("/api/v1/analytics/dashboards/overview/guest-token").flush({
      dashboardId: "dashboard",
      supersetUrl: "http://superset.test",
      guestToken: "first-guest",
    });
    await tick();
    const options = vi.mocked(embedDashboard).mock.calls.at(-1)![0];
    expect(options.id).toBe("dashboard");
    expect(await options.fetchGuestToken()).toBe("first-guest");
    const renewal = options.fetchGuestToken();
    http
      .expectOne("/api/v1/analytics/dashboards/overview/guest-token")
      .flush({ guestToken: "rotated-guest" });
    expect(await renewal).toBe("rotated-guest");
    fixture.destroy();
    expect(unmount).toHaveBeenCalledOnce();
    await expect(options.fetchGuestToken()).rejects.toMatchObject({
      name: "AbortError",
    });
    http.expectNone(() => true);
  });
  it("polls a queued report until it is published and stops on reset", async () => {
    vi.useFakeTimers();
    api.useToken(token());
    const state = TestBed.inject(ReportState);
    const first = state.refresh();
    http
      .expectOne("/api/v1/analytics/status")
      .flush({ latestReportRequest: { status: "queued" } });
    await first;
    await vi.advanceTimersByTimeAsync(3000);
    http
      .expectOne("/api/v1/analytics/status")
      .flush({ latestReportRequest: { status: "published" } });
    await tick();
    expect(state.status()["latestReportRequest"].status).toBe("published");
    state.reset();
    await vi.advanceTimersByTimeAsync(4000);
    http.expectNone(() => true);
  });
  it("opens the requested Angular route after login and clears routed staff data on logout", async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const router = TestBed.inject(Router);
    await router.navigateByUrl("/admin/clients");
    fixture.detectChanges();
    app.email = "staff@example.invalid";
    app.password = "test-only";
    const login = app.login();
    http
      .expectOne("/auth/login")
      .flush({ accessToken: token(), refreshToken: "refresh" });
    await tick();
    http.expectOne("/api/v1/analytics/status").flush({});
    await tick();
    fixture.detectChanges();
    http.expectOne("/api/v1/analytics/dashboards").flush([]);
    await login;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector("#clients-panel")).toBeTruthy();
    expect(router.url).toBe("/admin/clients");
    expect(
      TestBed.inject(ViewportScroller).scrollToPosition,
    ).toHaveBeenCalledWith([0, 0]);
    await router.navigateByUrl("/admin/actions");
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector("#actions-panel")).toBeTruthy();
    const logout = app.logout();
    await tick();
    http.expectOne("/auth/logout").flush({});
    await logout;
    fixture.detectChanges();
    expect(app.connected()).toBe(false);
    expect(fixture.nativeElement.querySelector("#actions-panel")).toBeNull();
    expect(router.url).toBe("/admin");
    fixture.destroy();
  });
  it("keeps analyst login/navigation separate and displays wrong-role errors", async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    await TestBed.inject(Router).navigateByUrl("/admin");
    fixture.detectChanges();
    const login = app.login();
    http
      .expectOne("/auth/login")
      .flush({ accessToken: token("ANALYST"), refreshToken: "refresh" });
    await tick();
    http.expectOne("/auth/logout").flush({});
    await login;
    fixture.detectChanges();
    expect(app.feedback.message()).toContain("requires ADMIN access");
    expect(app.connected()).toBe(false);
    http.expectNone((req) => req.url.startsWith("/api/"));
    await TestBed.inject(Router).navigateByUrl("/analyst");
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("J.A.R.V.I.S. sign in");
    fixture.destroy();
  });
});
