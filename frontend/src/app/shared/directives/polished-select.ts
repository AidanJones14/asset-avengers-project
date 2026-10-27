import { Directive, signal } from '@angular/core';

@Directive({
  selector: 'select',
  host: {
    class: 'polished-select',
    '[class.keyboard-navigation]': 'keyboardNavigation()',
    '(keydown)': 'keyboardNavigation.set(true)',
    '(pointermove)': 'keyboardNavigation.set(false)',
    '(pointerdown)': 'keyboardNavigation.set(false)',
  },
})
export class PolishedSelect {
  readonly keyboardNavigation = signal(false);
}
