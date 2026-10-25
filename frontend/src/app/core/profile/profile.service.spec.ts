import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { PatientProfile, DoctorProfile, ProfileResponse } from './profile.models';
import { ProfileService } from './profile.service';

const PATIENT_PROFILE: PatientProfile = {
  id: 'pat-1',
  name: 'Asha Patel',
  email: 'asha@example.com',
  phone: '+919876543210',
  role: 'patient',
  dateOfBirth: '1995-05-15',
  address: '123 Health Ave, Mumbai',
};

const DOCTOR_PROFILE: DoctorProfile = {
  id: 'doc-1',
  name: 'Dr. Sarah Smith',
  email: 'sarah@example.com',
  phone: '+919876543211',
  role: 'doctor',
  specialisations: ['Cardiology', 'General Medicine'],
  qualification: 'MBBS, MD',
};

describe('ProfileService', () => {
  let service: ProfileService;
  let authService: AuthService;
  let http: HttpTestingController;
  const PROFILE_URL = `${environment.apiUrl}/users/me`;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), AuthService, ProfileService],
    });
    service = TestBed.inject(ProfileService);
    authService = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('fetches the patient profile with GET /users/me', () => {
    let received: ProfileResponse | undefined;

    service.getProfile().subscribe((res) => (received = res));

    const req = http.expectOne(PROFILE_URL);
    expect(req.request.method).toBe('GET');
    req.flush({ user: PATIENT_PROFILE });

    expect(received).toEqual({ user: PATIENT_PROFILE });
  });

  it('fetches the doctor profile with GET /users/me', () => {
    let received: ProfileResponse | undefined;

    service.getProfile().subscribe((res) => (received = res));

    const req = http.expectOne(PROFILE_URL);
    expect(req.request.method).toBe('GET');
    req.flush({ user: DOCTOR_PROFILE });

    expect(received).toEqual({ user: DOCTOR_PROFILE });
  });

  it('sends partial updates with PUT /users/me and syncs name in AuthService', () => {
    authService.updateUser = vi.fn();

    const updates = { name: 'Asha Sharma', address: '456 New Road' };
    const updatedProfile: PatientProfile = {
      ...PATIENT_PROFILE,
      name: 'Asha Sharma',
      address: '456 New Road',
    };

    let received: ProfileResponse | undefined;
    service.updateProfile(updates).subscribe((res) => (received = res));

    const req = http.expectOne(PROFILE_URL);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(updates);
    req.flush({ user: updatedProfile });

    expect(received).toEqual({ user: updatedProfile });
    expect(authService.updateUser).toHaveBeenCalledWith({ name: 'Asha Sharma' });
  });

  it('propagates error when profile update fails', () => {
    let errorResponse: any;

    service.updateProfile({ name: 'Asha Sharma' }).subscribe({
      next: () => {
        throw new Error('should have failed');
      },
      error: (err) => (errorResponse = err),
    });

    const req = http.expectOne(PROFILE_URL);
    req.flush(
      { message: 'Name must be at most 100 characters', code: 'VALIDATION_ERROR' },
      { status: 400, statusText: 'Bad Request' },
    );

    expect(errorResponse.status).toBe(400);
    expect(errorResponse.error.code).toBe('VALIDATION_ERROR');
    expect(errorResponse.error.message).toBe('Name must be at most 100 characters');
  });
});
