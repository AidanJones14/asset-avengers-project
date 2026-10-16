import { Component } from '@angular/core';

@Component({
  selector: 'app-brand-logo',
  template: `<img src="brand/aa-mark.svg" alt="" width="104" height="72" /><span>Endgame</span>`,
  styles: `
    :host { display: flex; align-items: center; gap: var(--brand-gap, 9px); width: 100%; color: var(--text); }
    img { display: block; width: var(--brand-mark-size, 32px); height: var(--brand-mark-height, 30px); flex-shrink: 0; object-fit: contain; }
    span { font-size: var(--brand-font-size, 21px); font-weight: 600; letter-spacing: -.8px; line-height: 1.3; }
  `,
})
export class BrandLogo {}
