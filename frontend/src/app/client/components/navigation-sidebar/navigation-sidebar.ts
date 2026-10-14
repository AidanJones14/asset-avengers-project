import { Component, ElementRef, inject, output, signal, viewChild } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../auth/auth.service';
import { BrandLogo } from '../../../shared/components/brand-logo/brand-logo';

@Component({
  selector: 'app-navigation-sidebar',
  imports: [RouterLink, RouterLinkActive, BrandLogo],
  templateUrl: './navigation-sidebar.html',
  styleUrl: './navigation-sidebar.css',
  host: {
    '[class.collapsed]': 'collapsed()',
    '[class.mobile-open]': 'mobileOpen()',
  },
})
export class NavigationSidebar {
  readonly auth = inject(AuthService);
  readonly collapsed = signal(false);
  readonly mobileOpen = signal(false);
  readonly navigationSelected = output<void>();
  private readonly mobileToggle =
    viewChild.required<ElementRef<HTMLButtonElement>>('mobileToggle');

  closeMobile() {
    if (!this.mobileOpen()) return;
    this.mobileOpen.set(false);
    this.mobileToggle().nativeElement.focus();
  }

  selectNavigation() {
    if (!this.mobileOpen()) return;
    this.mobileOpen.set(false);
    this.navigationSelected.emit();
  }
}
