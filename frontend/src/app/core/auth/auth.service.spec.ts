import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { RegisterRequest } from './auth.models';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('posts the registration to /auth/register', () => {
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
});
