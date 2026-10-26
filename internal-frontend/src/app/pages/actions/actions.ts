import { easternDateTime } from "../../eastern-time";
import { investmentAccount } from "../../shared";
import { Component, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Page, Row, Column, DataTable, time, uuid } from "../../shared";
@Component({
  selector: "staff-actions",
  imports: [FormsModule, DataTable],
  templateUrl: "./actions.html",
})
export class ActionsPage extends Page {
  readonly investmentAccount = investmentAccount;
  resource = "accounts";
  id = "";
  action = "suspend";
  reason = "";
  reasonCategory = "";
  suspensionTiming = "now";
  suspensionDate = "";
  suspensionTime = "";
  suspensionHours = 0;
  suspensionMinutes = 0;
  suspensionSeconds = 0;
  query = "";
  auditFrom = "";
  auditTo = "";
  readonly selected = signal<Row | null>(null);
  readonly suggestions = signal<Row[]>([]);
  readonly searchMessage = signal("");
  readonly result = signal("");
  readonly audit = signal<Row[] | null>(null);
  private timer?: ReturnType<typeof setTimeout>;
  private version = 0;
  readonly columns: Column[] = [
    {
      label: "Person",
      read: (r) => r["fullName"] || r["email"] || r["clientId"],
      action: (r) => this.choose(r),
    },
    { label: "Email", read: (r) => r["email"] },
    { label: "Investment account", read: investmentAccount },
    { label: "Account ID", read: (r) => r["accountId"] },
    { label: "Status", read: (r) => (r["suspended"] ? "Suspended" : "Active") },
  ];
  readonly auditColumns: Column[] = [
    { label: "When", read: (r) => time(r["occurredAt"]) },
    { label: "Actor", read: (r) => r["actorEmail"] || r["actorId"] },
    { label: "Action", read: (r) => r["action"] },
    { label: "Account", read: (r) => r["targetAccountId"] },
    { label: "Reason", read: (r) => r["reason"] },
  ];
  reset() {
    clearTimeout(this.timer);
    this.version++;
    this.suspensionTiming = "now";
    this.selected.set(null);
    this.id = "";
    this.query = "";
    this.suggestions.set([]);
    this.searchMessage.set("");
    this.result.set("");
  }
  changed() {
    clearTimeout(this.timer);
    const version = ++this.version;
    this.id = "";
    this.selected.set(null);
    this.result.set("");
    this.suggestions.set([]);
    const query = this.query.trim();
    this.searchMessage.set(
      query ? "Searching…" : "Type a name to see account suggestions.",
    );
    if (!query) return;
    this.timer = this.later(() =>
      this.run(`account-suggestions-${version}`, async () => {
        const rows = await this.read<Row[]>(
          `admin/clients/suggestions?q=${encodeURIComponent(query)}`,
        );
        if (version !== this.version) return;
        this.suggestions.set(rows);
        this.searchMessage.set(
          rows.length ? "" : "No matching accounts found.",
        );
      }),
    );
  }
  choose(account: Row) {
    if (!uuid.test(account["accountId"])) {
      this.feedback.message.set("This account cannot be selected.");
      return;
    }
    this.version++;
    this.selected.set(account);
    this.id = account["accountId"];
    this.query = account["fullName"] || account["email"] || "";
    this.suggestions.set([]);
    this.searchMessage.set("");
  }
  apply() {
    this.run("action", async () => {
      if (
        this.resource === "accounts" &&
        (!this.selected() || this.selected()!["accountId"] !== this.id)
      )
        throw new Error("Choose a person from the account suggestions first.");
      if (!uuid.test(this.id)) throw new Error("Resource ID must be a UUID.");
      const accountSuspension = this.resource === "accounts" && this.action === "suspend";
      if (accountSuspension && !["Suspicious or Fraudulent Activity", "Inactive account", "Other"].includes(this.reasonCategory))
        throw new Error("Choose a suspension reason.");
      const reason = accountSuspension && this.reasonCategory !== "Other"
        ? this.reasonCategory : this.reason.trim();
      if (!reason) throw new Error("A reason is required.");
      if (reason.length > 1000) throw new Error("Reason must be at most 1000 characters.");
      const target = this.selected();
      const id = this.id;
      const action = this.action;
      let suspendAt: string | undefined;
      if (this.resource === "accounts" && action === "suspend" && this.suspensionTiming !== "now") {
        let when: Date;
        if (this.suspensionTiming === "date") {
          const match = /^(0?[1-9]|1[0-2])(?::([0-5]\d))?\s*(am|pm)$/i.exec(this.suspensionTime.trim());
          if (!match || !/^\d{4}-\d{2}-\d{2}$/.test(this.suspensionDate))
            throw new Error("Choose a date and enter a time like 7:00 PM or 12:00 AM.");
          const hour = Number(match[1]) % 12 + (match[3].toLowerCase() === "pm" ? 12 : 0);
          const minute = match[2] || "00";
          when = easternDateTime(`${this.suspensionDate}T${String(hour).padStart(2, "0")}:${minute}:00`);
        } else {
          const values = [this.suspensionHours, this.suspensionMinutes, this.suspensionSeconds];
          if (values.some(value => !Number.isSafeInteger(value) || value < 0)
              || this.suspensionMinutes > 59 || this.suspensionSeconds > 59)
            throw new Error("Enter whole hours, minutes (0–59), and seconds (0–59).");
          const seconds = this.suspensionHours * 3600 + this.suspensionMinutes * 60 + this.suspensionSeconds;
          when = new Date(Date.now() + seconds * 1000);
        }
        if (!Number.isFinite(when.getTime()) || when.getTime() <= Date.now())
          throw new Error("Choose a future suspension date or a countdown greater than zero.");
        suspendAt = when.toISOString();
      }
      this.result.set("");
      if (suspendAt) {
        await this.read(`admin/accounts/${id}/suspension-schedule`, {
          method: "POST", body: { reason, suspendAt },
        });
        this.result.set(`Suspension scheduled for ${target?.["fullName"] || target?.["email"] || id} on ${time(suspendAt)}. The account stays active until then. A new schedule replaces any previous schedule.`);
        return;
      }
      await this.read(`admin/${this.resource}/${id}/${action}`, {
        method: "POST",
        body: { reason },
      });
      this.result.set(
        `${action === "suspend" ? "Suspension applied" : "Suspension removed"} for ${target?.["fullName"] || target?.["email"] || id}. Copied account details update after synchronization.`,
      );
      if (target && this.selected()?.["accountId"] === id)
        this.selected.set({ ...target, suspended: action === "suspend" });
    });
  }
  loadAudit() {
    this.run("audit", async () =>
      this.audit.set((await this.read("admin/audit-log?page=0&size=20")).items),
    );
  }
  exportAudit() {
    this.run("audit-pdf", () => {
      if (!this.auditFrom || !this.auditTo)
        throw new Error("Choose the audit date range.");
      return this.download(
        `admin/audit-log/pdf?${new URLSearchParams({ from: this.auditFrom, to: this.auditTo })}`,
        `audit-log-${this.auditFrom}-${this.auditTo}.pdf`,
      );
    });
  }
}
