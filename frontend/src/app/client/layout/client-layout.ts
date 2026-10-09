import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { BrandLogo } from '../../shared/components/brand-logo/brand-logo';
@Component({
  selector: 'app-client-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, BrandLogo],
  templateUrl: './client-layout.html',
  styleUrl: './client-layout.css',
})
export class ClientLayout {
  readonly auth = inject(AuthService);
  readonly collapsed = signal(false);
  readonly mobileOpen = signal(false);

  closeMobile(focusTarget: HTMLElement) {
    if (!this.mobileOpen()) return;
    this.mobileOpen.set(false);
    focusTarget.focus();
  }
}
