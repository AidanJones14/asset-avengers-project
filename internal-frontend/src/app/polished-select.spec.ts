import { Component, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { FormsModule } from "@angular/forms";
import { PolishedSelect } from "./polished-select";

@Component({
  imports: [FormsModule, PolishedSelect],
  template: `
    <form>
      <select name="filter" [(ngModel)]="value" required [disabled]="disabled()">
        <option value="" disabled>Choose a filter</option>
        @for (choice of choices(); track choice) {
          <option [value]="choice">{{ choice }}</option>
        }
      </select>
      <select aria-label="Other filter"><option>Other</option></select>
    </form>
  `,
})
class SelectHost {
  value = signal("");
  disabled = signal(false);
  choices = signal(["First", "Second"]);
}

describe("PolishedSelect", () => {
  let fixture: ComponentFixture<SelectHost>;
  let select: HTMLSelectElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [SelectHost] });
    fixture = TestBed.createComponent(SelectHost);
    fixture.detectChanges();
    await fixture.whenStable();
    select = fixture.nativeElement.querySelector("select");
  });

  it("styles every select with independent input modality", () => {
    const other: HTMLSelectElement = fixture.nativeElement.querySelectorAll("select")[1];
    expect(select.classList.contains("polished-select")).toBe(true);
    expect(other.classList.contains("polished-select")).toBe(true);
    select.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    fixture.detectChanges();
    expect(select.classList.contains("keyboard-navigation")).toBe(true);
    expect(other.classList.contains("keyboard-navigation")).toBe(false);
    expect(fixture.componentInstance.value()).toBe("");
  });

  it("gives pointer movement and clicks precedence over keyboard highlighting", () => {
    for (const event of ["pointermove", "pointerdown"]) {
      select.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      fixture.detectChanges();
      expect(select.classList.contains("keyboard-navigation")).toBe(true);
      select.options[1].dispatchEvent(new Event(event, { bubbles: true }));
      fixture.detectChanges();
      expect(select.classList.contains("keyboard-navigation")).toBe(false);
    }
    expect(fixture.componentInstance.value()).toBe("");
  });

  it("preserves validation, selections, and model-driven resets", async () => {
    expect(select.validity.valueMissing).toBe(true);
    select.value = "Second";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.value()).toBe("Second");
    expect(select.validity.valid).toBe(true);
    fixture.componentInstance.value.set("");
    fixture.detectChanges();
    await fixture.whenStable();
    expect(select.value).toBe("");
    expect(select.options[0].disabled).toBe(true);
    expect(select.validity.valueMissing).toBe(true);
  });

  it("preserves disabled controls and dynamically loaded choices", async () => {
    fixture.componentInstance.disabled.set(true);
    fixture.componentInstance.choices.set(["New choice"]);
    fixture.componentInstance.value.set("New choice");
    fixture.detectChanges();
    await fixture.whenStable();
    expect(select.disabled).toBe(true);
    expect(select.value).toBe("New choice");
    expect(select.options).toHaveLength(2);
    expect(select.classList.contains("polished-select")).toBe(true);
  });
});
