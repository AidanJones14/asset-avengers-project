import { TestBed } from "@angular/core/testing";
import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { StaffApi } from "./api";
export const token = (role = "ADMIN", marker = "first") =>
  `header.${btoa(JSON.stringify({ sub: "staff", email: "staff@example.invalid", roles: [role], marker }))}.signature`;
const tick = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};
describe("Angular staff authentication", () => {
  let api: StaffApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(StaffApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it("does not persist tokens and refuses a client role", async () => {
    const before = [localStorage.length, sessionStorage.length];
    const login = api.login("client@example.invalid", "test-only");
    const rejected = expect(login).rejects.toThrow(
      "requires an ADMIN or ANALYST",
    );
    http
      .expectOne("/auth/login")
      .flush({ accessToken: token("CLIENT"), refreshToken: "test-refresh" });
    await tick();
    http.expectOne("/auth/logout").flush({});
    await rejected;
    expect(api.claims()).toBeNull();
    expect([localStorage.length, sessionStorage.length]).toEqual(before);
  });
  it("coalesces parallel 401s into a single refresh and retries with the rotated token", async () => {
    const login = api.login("admin@example.invalid", "test-only");
    http
      .expectOne("/auth/login")
      .flush({ accessToken: token(), refreshToken: "first-refresh" });
    await login;
    const first = api.request("admin/trades");
    const second = api.request("analytics/dashboards");
    http
      .expectOne("/api/v1/admin/trades")
      .flush({}, { status: 401, statusText: "Expired" });
    http
      .expectOne("/api/v1/analytics/dashboards")
      .flush({}, { status: 401, statusText: "Expired" });
    await tick();
    http.expectOne("/auth/refresh").flush({
      accessToken: token("ADMIN", "rotated"),
      refreshToken: "second-refresh",
    });
    await tick();
    for (const request of http.match((req) => req.url.startsWith("/api/"))) {
      expect(request.request.headers.get("Authorization")).toBe(
        `Bearer ${token("ADMIN", "rotated")}`,
      );
      request.flush([]);
    }
    expect(await first).toEqual([]);
    expect(await second).toEqual([]);
    const logout = api.logout();
    await tick();
    expect(api.claims()).toBeNull();
    const revoke = http.expectOne("/auth/logout");
    expect(revoke.request.body.refreshToken).toBe("second-refresh");
    revoke.flush({});
    await logout;
  });
  it("ignores responses from a session that has ended", async () => {
    api.useToken(token());
    const request = api.request("admin/trades");
    const rejected = expect(request).rejects.toMatchObject({
      name: "AbortError",
    });
    api.clearSession();
    http
      .expectOne("/api/v1/admin/trades")
      .flush({ items: [{ private: "old data" }] });
    await rejected;
  });
  it("shows API error text as a message and clears a token-only expired session", async () => {
    api.useToken(token());
    const result = api.request("admin/trades");
    const rejected = expect(result).rejects.toThrow("Session expired");
    http
      .expectOne("/api/v1/admin/trades")
      .flush({}, { status: 401, statusText: "Expired" });
    await rejected;
    expect(api.claims()).toBeNull();
    api.useToken(token());
    const failed = api.request("admin/trades");
    const failure = expect(failed).rejects.toThrow("<b>Unavailable</b>");
    http
      .expectOne("/api/v1/admin/trades")
      .flush(
        { detail: "<b>Unavailable</b>" },
        { status: 503, statusText: "Unavailable" },
      );
    await failure;
  });
});
