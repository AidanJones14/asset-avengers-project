import {
  Component,
  afterNextRender,
  ElementRef,
  Injector,
  DestroyRef,
  Injectable,
  inject,
  input,
  signal,
} from "@angular/core";
import { StaffApi, RequestOptions, aborted } from "./api";
export type Row = Record<string, any>;
export interface Column {
  label: string;
  read: (row: Row) => unknown;
  action?: (row: Row) => void;
  canAct?: (row: Row) => boolean;
}
export const time = (value: unknown) =>
  value ? new Date(String(value)).toLocaleString() : "Not recorded";
export const amount = (value: unknown) =>
  value == null
    ? "—"
    : Number(value).toLocaleString(undefined, { maximumFractionDigits: 4 });
export const money = (value: unknown) =>
  value == null
    ? "—"
    : new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
      }).format(Number(value));
export const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
@Component({
  selector: "staff-table",
  template: `@if (!rows().length) {
      <p class="empty">{{ empty() }}</p>
    } @else {
      <table>
        <thead>
          <tr>
            @for (column of columns(); track column.label) {
              <th scope="col">{{ column.label }}</th>
            }
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track $index) {
            <tr>
              @for (column of columns(); track column.label) {
                <td>
                  @if (
                    column.action && (!column.canAct || column.canAct(row))
                  ) {
                    <button
                      type="button"
                      class="link"
                      (click)="column.action(row)"
                    >
                      {{ column.read(row) ?? "—" }}
                    </button>
                  } @else {
                    {{ column.read(row) ?? "—" }}
                  }
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
    }`,
})
export class DataTable {
  readonly rows = input<Row[]>([]);
  readonly columns = input<Column[]>([]);
  readonly empty = input("No records found.");
}
@Component({
  selector: "staff-facts",
  template: `<dl class="facts">
    @for (fact of values(); track fact[0]) {
      <div>
        <dt>{{ fact[0] }}</dt>
        <dd>{{ fact[1] ?? "—" }}</dd>
      </div>
    }
  </dl>`,
})
export class Facts {
  readonly values = input<[string, unknown][]>([]);
}
@Injectable({ providedIn: "root" })
export class Feedback {
  readonly message = signal("");
  readonly busy = signal<Set<string>>(new Set());
  private readonly api = inject(StaffApi);
  async run(key: string, action: () => Promise<unknown> | unknown) {
    if (this.busy().has(key)) return;
    const version = this.api.revision;
    this.message.set("");
    this.busy.update((values) => new Set(values).add(key));
    try {
      await action();
    } catch (error) {
      if (
        !(error instanceof DOMException && error.name === "AbortError") &&
        (version === this.api.revision ||
          ["login", "token", "logout"].includes(key))
      )
        this.message.set(this.api.error(error).message);
    } finally {
      this.busy.update((values) => {
        const next = new Set(values);
        next.delete(key);
        return next;
      });
    }
  }
}
/** Async results and timers belong to the routed page that started them. */
export abstract class Page {
  readonly api = inject(StaffApi);
  readonly feedback = inject(Feedback);
  protected destroyed = false;
  private readonly injector = inject(Injector);
  protected reveal(element: () => ElementRef<HTMLElement> | undefined) {
    afterNextRender(
      () => {
        if (!this.destroyed)
          element()?.nativeElement.scrollIntoView?.({
            behavior: "smooth",
            block: "start",
          });
      },
      { injector: this.injector },
    );
  }
  private timers = new Set<ReturnType<typeof setTimeout>>();
  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      for (const timer of this.timers) clearTimeout(timer);
    });
  }
  protected later(action: () => void, delay = 250) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (!this.destroyed) action();
    }, delay);
    this.timers.add(timer);
    return timer;
  }
  protected async read<T = any>(
    path: string,
    options?: RequestOptions,
  ): Promise<T> {
    try {
      const result = await this.api.request<T>(path, options);
      if (this.destroyed) throw aborted();
      return result;
    } catch (error) {
      if (this.destroyed) throw aborted();
      throw error;
    }
  }
  run(key: string, action: () => Promise<unknown> | unknown) {
    return this.feedback.run(key, action);
  }
  async download(path: string, filename: string) {
    const blob = await this.read<Blob>(path, { download: true });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export const investmentAccount = (row: Row) => `${row["accountName"] || "Unknown investment account"} · ${row["accountType"] || "Unknown type"}`;
