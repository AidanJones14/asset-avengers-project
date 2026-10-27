import { TestBed } from "@angular/core/testing";
import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { StaffApi, admits } from "./api";
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
  // Staff security: SUPER_ADMIN holds a session and uses the admin workspace only.
  it("admits SUPER_ADMIN to the admin workspace but not the analyst one", async () => {
    const login = api.login("super@example.invalid", "test-only");
    http
      .expectOne("/auth/login")
      .flush({ accessToken: token("SUPER_ADMIN"), refreshToken: "refresh" });
    await login;
    expect(api.claims()?.roles).toEqual(["SUPER_ADMIN"]);
    expect(admits("ADMIN", ["SUPER_ADMIN"])).toBe(true);
    expect(admits("ANALYST", ["SUPER_ADMIN"])).toBe(false);
    expect(admits("ADMIN", ["ANALYST"])).toBe(false);
  });
  // D3: no tokens and no session until the temporary password is replaced.
  it("returns a required password change without starting a session", async () => {
    const login = api.login("new@example.invalid", " temporary ");
    const request = http.expectOne("/auth/login");
    expect(request.request.body).toEqual({ email: "new@example.invalid", password: " temporary " });
    request.flush({ passwordChangeRequired: true });
    expect(await login).toEqual({ passwordChangeRequired: true });
    expect(api.claims()).toBeNull();
    const change = api.changeTemporaryPassword("new@example.invalid", " temporary ", "my own password");
    const sent = http.expectOne("/auth/change-temporary-password");
    expect(sent.request.body).toEqual({ email: "new@example.invalid", password: " temporary ", newPassword: "my own password" });
    sent.flush({ mfaRequired: true, purpose: "enroll", challengeToken: "setup" });
    expect(await change).toMatchObject({ mfaRequired: true, purpose: "enroll" });
    expect(api.claims()).toBeNull();
  });
  it("sends auth-server staff calls with the same refresh and retry, and words the rate limit", async () => {
    const login = api.login("admin@example.invalid", "test-only");
    http
      .expectOne("/auth/login")
      .flush({ accessToken: token(), refreshToken: "first-refresh" });
    await login;
    const list = api.request("", { base: "/auth/admin/staff" });
    http
      .expectOne("/auth/admin/staff")
      .flush({}, { status: 401, statusText: "Expired" });
    await tick();
    http.expectOne("/auth/refresh").flush({ accessToken: token("ADMIN", "rotated"), refreshToken: "second-refresh" });
    await tick();
    http.expectOne("/auth/admin/staff").flush([{ id: "one" }]);
    expect(await list).toEqual([{ id: "one" }]);
    const limited = api.request("/analysts", { method: "POST", body: {}, base: "/auth/admin/staff" });
    const rejected = expect(limited).rejects.toThrow("Too many requests. Wait a few minutes, then try again.");
    http
      .expectOne("/auth/admin/staff/analysts")
      .flush({ detail: "ThrottlerException: Too Many Requests" }, { status: 429, statusText: "Too Many Requests" });
    await rejected;
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

  it("names the failed field rules instead of the generic validation title", async () => {
    api.useToken(token());
    const result = api.request("admin/trades");
    const rejected = expect(result).rejects.toThrow("newPassword must be longer than or equal to 12 characters");
    http.expectOne("/api/v1/admin/trades").flush(
      {
        code: "VALIDATION_FAILED",
        detail: "Request body failed validation",
        errors: [{ field: "newPassword", message: "newPassword must be longer than or equal to 12 characters" }],
      },
      { status: 400, statusText: "Bad Request" },
    );
    await rejected;
  });
});
