import { Component } from '@angular/core';
@Component({ selector: 'app-portfolio-preview', template: `<section class="panel">
  <h2>Your portfolio starts with you</h2><p>Add a bank account and deposit funds to start trading.</p>
  <p>Search stocks, star your favorites, and track your holdings and returns.</p>
  <p>Your saved account is restored when you log in again.</p></section>`,
  styles: `.panel { margin-top:36px; } p { margin-top:20px; line-height:1.7; }` })
export class PortfolioPreview {}
