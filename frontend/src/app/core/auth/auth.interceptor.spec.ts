import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { environment } from '../../../environments/environment';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';
import { fakeJwt } from './testing';

const API_URL = `${environment.apiUrl}/users/me`;

describe('authInterceptor', () => {
  let client: HttpClient;
  let http: HttpTestingController;
  let router: Router;

  function setup(token: string | null) {
    if (token) {
      localStorage.setItem('medisync.token', token);
      localStorage.setItem(
        'medisync.user',
        JSON.stringify({ id: '1', name: 'Asha', email: 'asha@example.com', role: 'patient' }),
      );
    }
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  }

  beforeEach(() => localStorage.clear());

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('adds the Bearer header to API requests when logged in', () => {
    const token = fakeJwt(3600);
    setup(token);

    client.get(API_URL).subscribe();

    const call = http.expectOne(API_URL);
    expect(call.request.headers.get('Authorization')).toBe(`Bearer ${token}`);
    call.flush({});
  });

  it('adds no header when logged out', () => {
    setup(null);

    client.get(API_URL).subscribe();

    const call = http.expectOne(API_URL);
    expect(call.request.headers.has('Authorization')).toBe(false);
    call.flush({});
  });

  it('never sends the token to another website', () => {
    setup(fakeJwt(3600));

    client.get('https://example.com/data').subscribe();

    const call = http.expectOne('https://example.com/data');
    expect(call.request.headers.has('Authorization')).toBe(false);
    call.flush({});
  });

  it('ends the session and goes to login when the server answers 401', () => {
    setup(fakeJwt(3600));
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    let failed = false;

    client.get(API_URL).subscribe({ error: () => (failed = true) });
    http
      .expectOne(API_URL)
      .flush({ message: 'Token expired' }, { status: 401, statusText: 'Unauthorized' });

    expect(failed).toBe(true);
    expect(TestBed.inject(AuthService).isLoggedIn()).toBe(false);
    expect(localStorage.getItem('medisync.token')).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/login');
  });

  it('does not redirect when a logged-out request gets 401 (a wrong password)', () => {
    setup(null);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    client.post(`${environment.apiUrl}/auth/login`, {}).subscribe({ error: () => {} });
    http
      .expectOne(`${environment.apiUrl}/auth/login`)
      .flush({ message: 'Invalid email or password' }, { status: 401, statusText: 'Unauthorized' });

    expect(navigate).not.toHaveBeenCalled();
  });

  it('keeps the session when the server answers with another error', () => {
    setup(fakeJwt(3600));

    client.get(API_URL).subscribe({ error: () => {} });
    http
      .expectOne(API_URL)
      .flush({ message: 'Forbidden' }, { status: 403, statusText: 'Forbidden' });

    expect(TestBed.inject(AuthService).isLoggedIn()).toBe(true);
  });
});
