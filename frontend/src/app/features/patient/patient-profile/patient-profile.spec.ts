import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { routes } from '../../../app.routes';
import { environment } from '../../../../environments/environment';
import { fakeJwt } from '../../../core/auth/testing';
import { PatientProfile as PatientProfileData } from '../../../core/profile/profile.models';
import { PatientProfile } from './patient-profile';

const USERS_ME_URL = `${environment.apiUrl}/users/me`;

const MOCK_PATIENT: PatientProfileData = {
  id: 'pat-1',
  name: 'Asha Patel',
  email: 'asha@example.com',
  phone: '+919876543210',
  role: 'patient',
  dateOfBirth: '1995-05-15',
  address: '123 Health Ave, Mumbai',
};

describe('PatientProfile Component', () => {
  let fixture: ComponentFixture<PatientProfile>;
  let component: PatientProfile;
  let page: HTMLElement;
  let http: HttpTestingController;

  beforeEach(async () => {
    localStorage.setItem('medisync.token', fakeJwt(3600));
    localStorage.setItem(
      'medisync.user',
      JSON.stringify({ id: 'pat-1', name: 'Asha Patel', email: 'asha@example.com', role: 'patient' }),
    );

    await TestBed.configureTestingModule({
      imports: [PatientProfile],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(PatientProfile);
    component = fixture.componentInstance;
    page = fixture.nativeElement as HTMLElement;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('loads and displays patient profile details on init', async () => {
    fixture.detectChanges();

    const req = http.expectOne(USERS_ME_URL);
    expect(req.request.method).toBe('GET');
    req.flush({ user: MOCK_PATIENT });

    await fixture.whenStable();
    fixture.detectChanges();

    const nameInput = page.querySelector<HTMLInputElement>('#profile-name')!;
    const emailInput = page.querySelector<HTMLInputElement>('#profile-email')!;
    const phoneInput = page.querySelector<HTMLInputElement>('#profile-phone')!;
    const dobInput = page.querySelector<HTMLInputElement>('#profile-dob')!;
    const addressInput = page.querySelector<HTMLTextAreaElement>('#profile-address')!;

    expect(nameInput.value).toBe('Asha Patel');
    expect(emailInput.value).toBe('asha@example.com');
    expect(phoneInput.value).toBe('+919876543210');
    expect(dobInput.value).toBe('1995-05-15');
    expect(addressInput.value).toBe('123 Health Ave, Mumbai');
  });

  it('email field is rendered as readonly/disabled and has hint stating it cannot be changed', async () => {
    fixture.detectChanges();
    http.expectOne(USERS_ME_URL).flush({ user: MOCK_PATIENT });
    await fixture.whenStable();
    fixture.detectChanges();

    const emailInput = page.querySelector<HTMLInputElement>('#profile-email')!;
    expect(emailInput.readOnly || emailInput.disabled).toBe(true);
    expect(page.textContent).toContain('Email address cannot be changed.');
  });

  it('disables save button initially when form is unchanged', async () => {
    fixture.detectChanges();
    http.expectOne(USERS_ME_URL).flush({ user: MOCK_PATIENT });
    await fixture.whenStable();
    fixture.detectChanges();

    const saveButton = page.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(saveButton.disabled).toBe(true);
    expect(page.querySelector('button.button-secondary')).toBeNull(); // Cancel button not visible
  });

  it('validates required fields and shows inline error messages', async () => {
    fixture.detectChanges();
    http.expectOne(USERS_ME_URL).flush({ user: MOCK_PATIENT });
    await fixture.whenStable();
    fixture.detectChanges();

    const nameInput = page.querySelector<HTMLInputElement>('#profile-name')!;
    nameInput.value = '';
    nameInput.dispatchEvent(new Event('input'));
    nameInput.dispatchEvent(new Event('blur'));

    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.textContent).toContain('Name is required.');
    const saveButton = page.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(saveButton.disabled).toBe(true);
  });

  it('validates that date of birth cannot be in the future', async () => {
    fixture.detectChanges();
    http.expectOne(USERS_ME_URL).flush({ user: MOCK_PATIENT });
    await fixture.whenStable();
    fixture.detectChanges();

    const futureDate = '2099-01-01';
    const dobInput = page.querySelector<HTMLInputElement>('#profile-dob')!;
    dobInput.value = futureDate;
    dobInput.dispatchEvent(new Event('input'));
    dobInput.dispatchEvent(new Event('blur'));

    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.textContent).toContain('Date of birth cannot be in the future.');
    const saveButton = page.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(saveButton.disabled).toBe(true);
  });

  it('sends only dirty/changed fields (excluding email) on save', async () => {
    fixture.detectChanges();
    http.expectOne(USERS_ME_URL).flush({ user: MOCK_PATIENT });
    await fixture.whenStable();
    fixture.detectChanges();

    // Edit only address
    const addressInput = page.querySelector<HTMLTextAreaElement>('#profile-address')!;
    addressInput.value = '789 New Blvd, Pune';
    addressInput.dispatchEvent(new Event('input'));

    await fixture.whenStable();
    fixture.detectChanges();

    const saveButton = page.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(saveButton.disabled).toBe(false);

    // Submit form
    page.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    const putReq = http.expectOne(USERS_ME_URL);
    expect(putReq.request.method).toBe('PUT');
    // Strictly ONLY address is sent; name, phone, dateOfBirth and email must be excluded!
    expect(putReq.request.body).toEqual({ address: '789 New Blvd, Pune' });

    putReq.flush({
      user: {
        ...MOCK_PATIENT,
        address: '789 New Blvd, Pune',
      },
    });

    await fixture.whenStable();
    fixture.detectChanges();

    // Success banner shown
    expect(page.textContent).toContain('Profile updated successfully.');
    expect(saveButton.disabled).toBe(true); // reset back to pristine
  });

  it('shows server error message as written with role="alert" on update failure', async () => {
    fixture.detectChanges();
    http.expectOne(USERS_ME_URL).flush({ user: MOCK_PATIENT });
    await fixture.whenStable();
    fixture.detectChanges();

    const nameInput = page.querySelector<HTMLInputElement>('#profile-name')!;
    nameInput.value = 'Asha Changed';
    nameInput.dispatchEvent(new Event('input'));

    await fixture.whenStable();
    fixture.detectChanges();

    page.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    const putReq = http.expectOne(USERS_ME_URL);
    putReq.flush(
      { message: 'Database write failed', code: 'INTERNAL_ERROR' },
      { status: 500, statusText: 'Server Error' },
    );

    await fixture.whenStable();
    fixture.detectChanges();

    const errorAlert = page.querySelector('.error-box')!;
    expect(errorAlert).not.toBeNull();
    expect(errorAlert.getAttribute('role')).toBe('alert');
    expect(errorAlert.textContent).toContain('Database write failed');
  });

  it('shows friendly connection error when server cannot be reached (status 0)', async () => {
    fixture.detectChanges();

    const req = http.expectOne(USERS_ME_URL);
    req.error(new ProgressEvent('error'));

    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.textContent).toContain('Cannot reach the server. Please try again.');
  });

  it('resets changes back to initial values when cancel button is clicked', async () => {
    fixture.detectChanges();
    http.expectOne(USERS_ME_URL).flush({ user: MOCK_PATIENT });
    await fixture.whenStable();
    fixture.detectChanges();

    const nameInput = page.querySelector<HTMLInputElement>('#profile-name')!;
    nameInput.value = 'Temporary Name';
    nameInput.dispatchEvent(new Event('input'));

    await fixture.whenStable();
    fixture.detectChanges();

    const cancelBtn = page.querySelector<HTMLButtonElement>('.button-secondary')!;
    expect(cancelBtn).not.toBeNull();
    cancelBtn.click();

    await fixture.whenStable();
    fixture.detectChanges();

    expect(nameInput.value).toBe('Asha Patel');
    expect(page.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
  });

  it('verifies route guard configuration for /patient/profile', () => {
    const route = routes.find((r) => r.path === 'patient/profile');
    expect(route).toBeDefined();
    expect(route?.title).toBe('Patient profile | MediSync');
    expect(route?.canActivate).toBeDefined();
    expect(route?.canActivate?.length).toBeGreaterThan(0);
  });
});
