import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-auth-page',
  imports: [FormsModule, RouterLink],
  templateUrl: './auth-page.html',
  styleUrl: './auth-page.css',
})
export class AuthPage {
  readonly signup = inject(ActivatedRoute).snapshot.data['signup'] === true;
  readonly router = inject(Router);
  readonly showPassword = signal(false);
  readonly submitted = signal(false);
  name = '';
  email = '';
  password = '';
  confirmation = '';
  get mismatch() {
    return this.signup && this.password !== this.confirmation;
  }
  submit(form: NgForm) {
    this.submitted.set(true);
    if (form.invalid || this.mismatch || (this.signup && !this.name.trim())) {
      form.control.markAllAsTouched();
      return;
    }
    // UI demo only: credentials are never stored or sent to a server.
    this.password = '';
    this.confirmation = '';
    void this.router.navigateByUrl('/client/overview');
  }
}
