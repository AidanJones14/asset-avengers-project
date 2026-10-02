import { Component } from '@angular/core';

@Component({
  selector: 'app-brand-logo',
  template: `<img src="brand/asset-avengers-logo.png" alt="Asset Avengers" width="2161" height="728" />`,
  styles: `
    :host {
      display: block;
      position: relative;
      width: 100%;
      aspect-ratio: 6 / 1;
      overflow: hidden;
    }
    img {
      /* Frame the artwork without the generated image's outer transparent padding. */
      position: absolute;
      width: 114%;
      max-width: none;
      height: auto;
      left: -8%;
      top: -55%;
    }
  `,
})
export class BrandLogo {}
