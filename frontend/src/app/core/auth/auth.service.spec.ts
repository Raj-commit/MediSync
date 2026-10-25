import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { AuthUser, LoginResponse, RegisterRequest } from './auth.models';
import { AuthService } from './auth.service';
import { fakeJwt } from './testing';

const USER: AuthUser = { id: '1', name: 'Asha Patel', email: 'asha@example.com', role: 'patient' };

describe('AuthService', () => {
  let http: HttpTestingController;

  function createService(): AuthService {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(AuthService);
  }

  beforeEach(() => localStorage.clear());

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('posts the registration to /auth/register', () => {
    const service = createService();
    const request: RegisterRequest = {
      role: 'patient',
      name: 'Asha Patel',
      email: 'asha@example.com',
      phone: '9876543210',
      password: 'password123',
      dateOfBirth: '1999-04-12',
      address: '12 Main Road',
    };

    service.register(request).subscribe();

    const call = http.expectOne(`${environment.apiUrl}/auth/register`);
    expect(call.request.method).toBe('POST');
    expect(call.request.body).toEqual(request);
    call.flush({});
  });

  it('starts logged out when nothing is stored', () => {
    const service = createService();

    expect(service.isLoggedIn()).toBe(false);
    expect(service.token()).toBeNull();
    expect(service.user()).toBeNull();
    expect(service.role()).toBeNull();
  });

  it('posts the credentials, stores the session and exposes it', () => {
    const service = createService();
    const token = fakeJwt(3600);
    const response: LoginResponse = { token, user: USER };
    let received: LoginResponse | undefined;

    service
      .login({ email: 'asha@example.com', password: 'password123' })
      .subscribe((r) => (received = r));

    const call = http.expectOne(`${environment.apiUrl}/auth/login`);
    expect(call.request.method).toBe('POST');
    expect(call.request.body).toEqual({ email: 'asha@example.com', password: 'password123' });
    call.flush(response);

    expect(received).toEqual(response);
    expect(service.isLoggedIn()).toBe(true);
    expect(service.token()).toBe(token);
    expect(service.user()).toEqual(USER);
    expect(service.role()).toBe('patient');
    expect(localStorage.getItem('medisync.token')).toBe(token);
    expect(JSON.parse(localStorage.getItem('medisync.user')!)).toEqual(USER);
  });

  it('does not store anything when the login fails', () => {
    const service = createService();

    service.login({ email: 'asha@example.com', password: 'wrong' }).subscribe({ error: () => {} });
    http
      .expectOne(`${environment.apiUrl}/auth/login`)
      .flush({ message: 'Invalid email or password' }, { status: 401, statusText: 'Unauthorized' });

    expect(service.isLoggedIn()).toBe(false);
    expect(localStorage.getItem('medisync.token')).toBeNull();
  });

  it('clears the session and storage on logout', () => {
    const service = createService();
    service.login({ email: 'asha@example.com', password: 'password123' }).subscribe();
    http.expectOne(`${environment.apiUrl}/auth/login`).flush({ token: fakeJwt(3600), user: USER });

    service.logout();

    expect(service.isLoggedIn()).toBe(false);
    expect(service.token()).toBeNull();
    expect(localStorage.getItem('medisync.token')).toBeNull();
    expect(localStorage.getItem('medisync.user')).toBeNull();
  });

  it('restores a stored session after a reload', () => {
    const token = fakeJwt(3600);
    localStorage.setItem('medisync.token', token);
    localStorage.setItem('medisync.user', JSON.stringify(USER));

    const service = createService();

    expect(service.isLoggedIn()).toBe(true);
    expect(service.token()).toBe(token);
    expect(service.user()).toEqual(USER);
  });

  it('drops a stored session whose token has expired', () => {
    localStorage.setItem('medisync.token', fakeJwt(-60));
    localStorage.setItem('medisync.user', JSON.stringify(USER));

    const service = createService();

    expect(service.isLoggedIn()).toBe(false);
    expect(localStorage.getItem('medisync.token')).toBeNull();
    expect(localStorage.getItem('medisync.user')).toBeNull();
  });

  it('drops stored data that is damaged', () => {
    localStorage.setItem('medisync.token', fakeJwt(3600));
    localStorage.setItem('medisync.user', '{not json');

    const service = createService();

    expect(service.isLoggedIn()).toBe(false);
    expect(localStorage.getItem('medisync.user')).toBeNull();
  });

  it('updates the stored user and updates the signal', () => {
    const token = fakeJwt(3600);
    localStorage.setItem('medisync.token', token);
    localStorage.setItem('medisync.user', JSON.stringify(USER));

    const service = createService();
    service.updateUser({ name: 'Asha Sharma' });

    expect(service.user()?.name).toBe('Asha Sharma');
    expect(service.user()?.email).toBe('asha@example.com');
    expect(JSON.parse(localStorage.getItem('medisync.user')!).name).toBe('Asha Sharma');
  });

  it('safely ignores updateUser when logged out', () => {
    const service = createService();
    service.updateUser({ name: 'Someone' });

    expect(service.user()).toBeNull();
    expect(localStorage.getItem('medisync.user')).toBeNull();
  });
});
