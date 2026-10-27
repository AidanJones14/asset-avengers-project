import { Component } from '@angular/core';

@Component({
  selector: 'app-brand-logo',
  template: `<img src="brand/aa-mark.svg" alt="" width="104" height="72" /><span>Endgame</span>`,
  styles: `
    :host { display: flex; align-items: center; gap: var(--brand-gap, 9px); width: 100%; color: var(--text); }
    img { display: block; width: var(--brand-mark-size, 32px); height: var(--brand-mark-height, 30px); flex-shrink: 0; object-fit: contain; }
    span { font-size: var(--brand-font-size, 21px); font-weight: 600; letter-spacing: -.8px; line-height: 1.3; }
    @media (prefers-reduced-motion: no-preference) {
      img { animation: brand-arrive 800ms cubic-bezier(.2,.75,.25,1) both; transition: transform 280ms ease, filter 280ms ease; }
      span { animation: brand-wordmark 650ms 120ms ease both; }
      :host(:hover) img { transform: translateY(-2px) rotate(-5deg) scale(1.06); filter: drop-shadow(0 0 7px rgba(179,245,104,.3)); }
    }
    @keyframes brand-arrive {
      from { opacity: 0; translate: 0 6px; scale: .9; }
      to { opacity: 1; translate: 0 0; scale: 1; }
    }
    @keyframes brand-wordmark {
      from { opacity: 0; translate: -5px 0; }
      to { opacity: 1; translate: 0 0; }
    }
  `,
})
export class BrandLogo {}
