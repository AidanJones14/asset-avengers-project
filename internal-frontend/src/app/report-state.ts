import { Injectable, inject, signal } from "@angular/core";
import { StaffApi } from "./api";
import { Feedback, Row } from "./shared";
@Injectable({ providedIn: "root" })
export class ReportState {
  private readonly api = inject(StaffApi);
  private readonly feedback = inject(Feedback);
  readonly status = signal<Row>({});
  readonly dashboards = signal<Row[]>([]);
  private poll?: ReturnType<typeof setTimeout>;
  reset() {
    clearTimeout(this.poll);
    this.status.set({});
    this.dashboards.set([]);
  }
  async refresh() {
    const status = await this.api.request<Row>("analytics/status");
    this.status.set(status);
    clearTimeout(this.poll);
    if (status["latestReportRequest"]?.status === "queued")
      this.poll = setTimeout(
        () => this.feedback.run("status", () => this.refresh()),
        3000,
      );
  }
  async loadDashboards() {
    this.dashboards.set(await this.api.request<Row[]>("analytics/dashboards"));
  }
}
