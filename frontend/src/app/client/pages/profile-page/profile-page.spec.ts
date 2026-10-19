import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { NgForm } from '@angular/forms';
import { ProfilePage } from './profile-page';
import { AuthService } from '../../../auth/auth.service';

describe('Profile page', () => {
  beforeEach(() => TestBed.configureTestingModule({imports: [ProfilePage], providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]}));
  afterEach(() => { TestBed.inject(HttpTestingController).verify(); localStorage.removeItem('endgame.theme'); });
  function setup() {
    const fixture = TestBed.createComponent(ProfilePage);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/auth/profile').flush({email: 'sam@example.com', firstName: 'Sam', lastName: 'Client', roles: ['CLIENT']});
    fixture.detectChanges();
    return { fixture, http, page: fixture.componentInstance };
  }
  it('loads account details and updates the display claims when the name is saved', () => {
    const { fixture, http, page } = setup();
    expect(fixture.nativeElement.textContent).toContain('sam@example.com');
    page.firstName = 'Sameem'; page.lastName = 'Saleem';
    page.save({ invalid: false } as NgForm);
    const request = http.expectOne('/auth/profile');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({firstName: 'Sameem', lastName: 'Saleem'});
    request.flush({email: 'sam@example.com', firstName: 'Sameem', lastName: 'Saleem', roles: ['CLIENT'], accessToken: 'header.' + btoa(JSON.stringify({name: 'Sameem Saleem', email: 'sam@example.com', roles: ['CLIENT']})) + '.signature'});
    expect(TestBed.inject(AuthService).fullName()).toBe('Sameem Saleem');
    expect(page.success()).toContain('updated');
  });
  it('blocks mismatched new passwords and preserves the session on an incorrect current password', () => {
    const { http, page } = setup();
    page.currentPassword = 'OldPassword123!'; page.newPassword = 'NewPassword123!'; page.confirmation = 'different';
    page.savePassword({ invalid: false, control: {markAllAsTouched: () => {}} } as unknown as NgForm);
    http.expectNone('/auth/profile/password');
    page.confirmation = page.newPassword;
    page.savePassword({ invalid: false } as NgForm);
    http.expectOne('/auth/profile/password').flush({detail:'Your current password is incorrect.'}, {status:400, statusText:'Bad Request'});
    expect(page.passwordError()).toContain('current password');
    expect(page.passwordSaving()).toBe(false);
    http.expectNone('/auth/logout');
  });
  it('changes appearance from profile settings', () => {
    const { page } = setup();
    page.chooseTheme('light'); expect(document.documentElement.dataset['theme']).toBe('light');
    page.chooseTheme('dark'); expect(localStorage.getItem('endgame.theme')).toBe('dark');
  });
});
