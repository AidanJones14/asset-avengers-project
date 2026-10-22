import { Component, ElementRef, computed, signal, viewChild } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Page, Row, Column, DataTable, time } from "../../shared";
import { Role } from "../../api";

// auth-server's staff-account routes, not internal-backend's /api/v1.
const STAFF = "/auth/admin/staff";
const staffName = (row: Row) =>
  [row["firstName"], row["lastName"]].filter(Boolean).join(" ") || row["email"];
function staffStatus(row: Row) {
  if (row["disabledAt"]) return `Disabled ${time(row["disabledAt"])}`;
  if (row["passwordChangeRequired"]) return "Must choose a password";
  return row["mfaEnrolled"] ? "Active" : "Authenticator not set up";
}

/** Staff accounts (staff security D2–D4). auth-server enforces every rule; the role choices and
 * buttons only hide what it would refuse. Rows update from each answer instead of re-fetching,
 * because auth-server allows 20 requests per 15 minutes per route. */
@Component({
  selector: "staff-accounts",
  imports: [FormsModule, DataTable],
  templateUrl: "./staff.html",
})
export class StaffPage extends Page {
  role: string = Role.ANALYST;
  email = "";
  firstName = "";
  lastName = "";
  readonly accounts = signal<Row[]>([]);
  readonly loading = signal(false);
  readonly failed = signal(false);
  readonly status = signal("");
  // The one-time temporary password: only in this signal while the dialog is open.
  readonly created = signal<{ name: string; email: string; temporaryPassword: string } | null>(null);
  readonly copied = signal("");
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>("passwordDialog");
  private readonly passwordField = viewChild<ElementRef<HTMLInputElement>>("passwordValue");
  readonly superAdmin = computed(() => !!this.api.claims()?.roles.includes(Role.SUPER_ADMIN));
  // A super admin creates admins and analysts; an admin creates analysts only.
  readonly roles = computed(() =>
    this.superAdmin() ? [[Role.ANALYST, "Analyst"], [Role.ADMIN, "Admin"]] : [[Role.ANALYST, "Analyst"]],
  );
  readonly columns: Column[] = [
    { label: "Name", read: staffName },
    { label: "Email", read: (r) => r["email"] },
    { label: "Role", read: (r) => r["role"] },
    { label: "Status", read: staffStatus },
    {
      label: "Action",
      read: (r) => (this.canManage(r) ? (r["disabledAt"] ? "Enable" : "Disable") : null),
      canAct: (r) => this.canManage(r),
      action: (r) => this.setDisabled(r, !r["disabledAt"]),
    },
  ];
  constructor() {
    super();
    this.refresh();
  }
  // Mirrors StaffService.setDisabled: never yourself, never a super admin, an admin only analysts.
  canManage(row: Row) {
    return (
      row["id"] !== this.api.claims()?.sub &&
      row["role"] !== Role.SUPER_ADMIN &&
      (this.superAdmin() || row["role"] === Role.ANALYST)
    );
  }
  refresh() {
    this.run("staff-list", async () => {
      this.loading.set(true);
      this.failed.set(false);
      try {
        this.accounts.set(await this.read<Row[]>("", { base: STAFF }));
      } catch (error) {
        this.failed.set(true);
        throw error;
      } finally {
        this.loading.set(false);
      }
    });
  }
  create() {
    this.run("staff-create", async () => {
      const details = {
        email: this.email.trim(),
        firstName: this.firstName.trim(),
        lastName: this.lastName.trim(),
      };
      // The route chooses the role; it is never sent in the body.
      const created = await this.read<Row>(this.role === Role.ADMIN ? "/admins" : "/analysts", {
        method: "POST",
        body: details,
        base: STAFF,
      });
      const name = `${details.firstName} ${details.lastName}`;
      // Built from the form and the answer: it must still choose a password and set up MFA.
      this.accounts.update((rows) => [
        ...rows,
        { id: created["id"], email: created["email"], firstName: details.firstName, lastName: details.lastName,
          role: created["role"], disabledAt: null, passwordChangeRequired: true, mfaEnrolled: false },
      ]);
      this.email = this.firstName = this.lastName = "";
      this.status.set(`Created ${name} (${created["role"]}).`);
      this.created.set({ name, email: created["email"], temporaryPassword: created["temporaryPassword"] });
      this.dialog()?.nativeElement.showModal();
    });
  }
  setDisabled(row: Row, disabled: boolean) {
    if (disabled && !window.confirm(`Disable ${staffName(row)}? They are signed out of Endgame and can't sign in until enabled.`))
      return;
    this.run(`staff-${row["id"]}`, async () => {
      const updated = await this.read<Row>(`/${encodeURIComponent(row["id"])}/${disabled ? "disable" : "enable"}`, {
        method: "POST",
        base: STAFF,
      });
      this.accounts.update((rows) =>
        rows.map((r) => (r["id"] === updated["id"] ? { ...r, disabledAt: updated["disabledAt"] } : r)),
      );
      this.status.set(`${disabled ? "Disabled" : "Enabled"} ${staffName(row)}.`);
    });
  }
  async copy() {
    // The Clipboard API needs a secure origin (localhost or HTTPS); elsewhere the text is left selected.
    try {
      await navigator.clipboard.writeText(this.created()?.temporaryPassword ?? "");
      this.copied.set("Copied.");
    } catch {
      this.passwordField()?.nativeElement.select();
      this.copied.set("Copying is blocked here. The password is selected: press Ctrl+C or ⌘C.");
    }
  }
  // Runs however the dialog closes (Done or Escape): the password leaves the page.
  closed() {
    this.created.set(null);
    this.copied.set("");
  }
}
