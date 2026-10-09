import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';
import { fakeAccessToken } from './testing';

describe('authInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'login', children: [] }]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);

    auth.login('frank.client@example.com', 'EndgameDemo123!').subscribe();
    backend.expectOne('/auth/login').flush({ accessToken: 'old-access', refreshToken: 'refresh-1' });
  });
  afterEach(() => backend.verify());

  it('sends the token to the Spring API only', () => {
    http.get('/api/v1/me/orders').subscribe();
    http.post('/auth/logout', {}).subscribe();
    expect(backend.expectOne('/api/v1/me/orders').request.headers.get('Authorization')).toBe(
      'Bearer old-access',
    );
    expect(backend.expectOne('/auth/logout').request.headers.has('Authorization')).toBe(false);
  });

  it('refreshes once for parallel 401s, then retries each request with the new token', () => {
    const results: string[] = [];
    http.get<string>('/api/v1/me/orders').subscribe((value) => results.push(value));
    http.get<string>('/api/v1/me/accounts').subscribe((value) => results.push(value));
    backend.expectOne('/api/v1/me/orders').flush(null, { status: 401, statusText: 'Unauthorized' });
    backend.expectOne('/api/v1/me/accounts').flush(null, { status: 401, statusText: 'Unauthorized' });

    const refresh = backend.expectOne('/auth/refresh');
    expect(refresh.request.body).toEqual({ refreshToken: 'refresh-1' });
    const newAccess = fakeAccessToken(['CLIENT']);
    refresh.flush({ accessToken: newAccess, refreshToken: 'refresh-2' });

    const orders = backend.expectOne('/api/v1/me/orders');
    const accounts = backend.expectOne('/api/v1/me/accounts');
    expect(orders.request.headers.get('Authorization')).toBe(`Bearer ${newAccess}`);
    orders.flush('orders');
    accounts.flush('accounts');
    expect(results).toEqual(['orders', 'accounts']);
    expect(sessionStorage.getItem('endgame.refreshToken')).toBe('refresh-2');
  });

  it('ends the session when the refresh is refused', () => {
    let failed = false;
    http.get('/api/v1/me/orders').subscribe({ error: () => (failed = true) });
    backend.expectOne('/api/v1/me/orders').flush(null, { status: 401, statusText: 'Unauthorized' });
    backend
      .expectOne('/auth/refresh')
      .flush({ title: 'Unauthorized', status: 401, code: 'UNAUTHORIZED' }, { status: 401, statusText: 'Unauthorized' });

    // Best-effort server logout, then local state is cleared.
    expect(backend.expectOne('/auth/logout').request.body).toEqual({ refreshToken: 'refresh-1' });
    expect(failed).toBe(true);
    expect(auth.isLoggedIn()).toBe(false);
    expect(sessionStorage.getItem('endgame.refreshToken')).toBeNull();
  });

  it('does not refresh on a 403', () => {
    let status = 0;
    http.get('/api/v1/admin/clients').subscribe({ error: (err) => (status = err.status) });
    backend.expectOne('/api/v1/admin/clients').flush(null, { status: 403, statusText: 'Forbidden' });
    backend.expectNone('/auth/refresh');
    expect(status).toBe(403);
  });
});
