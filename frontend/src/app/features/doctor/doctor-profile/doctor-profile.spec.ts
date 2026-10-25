import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { routes } from '../../../app.routes';
import { environment } from '../../../../environments/environment';
import { fakeJwt } from '../../../core/auth/testing';
import { DoctorProfile as DoctorProfileData } from '../../../core/profile/profile.models';
import { DoctorProfile } from './doctor-profile';

const USERS_ME_URL = `${environment.apiUrl}/users/me`;

const MOCK_DOCTOR: DoctorProfileData = {
  id: 'doc-1',
  name: 'Dr. Sarah Smith',
  email: 'sarah@example.com',
  phone: '+919876543211',
  role: 'doctor',
  specialisations: ['Cardiology', 'Internal Medicine'],
  qualification: 'MBBS, MD',
};

describe('DoctorProfile Component', () => {
  let fixture: ComponentFixture<DoctorProfile>;
  let component: DoctorProfile;
  let page: HTMLElement;
  let http: HttpTestingController;

  beforeEach(async () => {
    localStorage.setItem('medisync.token', fakeJwt(3600));
    localStorage.setItem(
      'medisync.user',
      JSON.stringify({ id: 'doc-1', name: 'Dr. Sarah Smith', email: 'sarah@example.com', role: 'doctor' }),
    );

    await TestBed.configureTestingModule({
      imports: [DoctorProfile],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(DoctorProfile);
    component = fixture.componentInstance;
    page = fixture.nativeElement as HTMLElement;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('loads and displays doctor profile details on init with comma-separated specialisations', async () => {
    fixture.detectChanges();

    const req = http.expectOne(USERS_ME_URL);
    expect(req.request.method).toBe('GET');
    req.flush({ user: MOCK_DOCTOR });

    await fixture.whenStable();
    fixture.detectChanges();

    const nameInput = page.querySelector<HTMLInputElement>('#doctor-name')!;
    const emailInput = page.querySelector<HTMLInputElement>('#doctor-email')!;
    const phoneInput = page.querySelector<HTMLInputElement>('#doctor-phone')!;
    const specInput = page.querySelector<HTMLInputElement>('#doctor-specialisations')!;
    const qualInput = page.querySelector<HTMLInputElement>('#doctor-qualification')!;

    expect(nameInput.value).toBe('Dr. Sarah Smith');
    expect(emailInput.value).toBe('sarah@example.com');
    expect(phoneInput.value).toBe('+919876543211');
    expect(specInput.value).toBe('Cardiology, Internal Medicine');
    expect(qualInput.value).toBe('MBBS, MD');
  });

  it('email field is rendered as readonly/disabled and has hint stating it cannot be changed', async () => {
    fixture.detectChanges();
    http.expectOne(USERS_ME_URL).flush({ user: MOCK_DOCTOR });
    await fixture.whenStable();
    fixture.detectChanges();

    const emailInput = page.querySelector<HTMLInputElement>('#doctor-email')!;
    expect(emailInput.readOnly || emailInput.disabled).toBe(true);
    expect(page.textContent).toContain('Email address cannot be changed.');
  });

  it('disables save button initially when form is unchanged', async () => {
    fixture.detectChanges();
    http.expectOne(USERS_ME_URL).flush({ user: MOCK_DOCTOR });
    await fixture.whenStable();
    fixture.detectChanges();

    const saveButton = page.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(saveButton.disabled).toBe(true);
    expect(page.querySelector('button.button-secondary')).toBeNull(); // Cancel button not visible
  });

  it('validates specialisations: required and max 10 items', async () => {
    fixture.detectChanges();
    http.expectOne(USERS_ME_URL).flush({ user: MOCK_DOCTOR });
    await fixture.whenStable();
    fixture.detectChanges();

    const specInput = page.querySelector<HTMLInputElement>('#doctor-specialisations')!;
    specInput.value = '';
    specInput.dispatchEvent(new Event('input'));
    specInput.dispatchEvent(new Event('blur'));

    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.textContent).toContain('Enter at least one specialisation.');

    // More than 10 specialisations
    specInput.value = '1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11';
    specInput.dispatchEvent(new Event('input'));
    specInput.dispatchEvent(new Event('blur'));

    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.textContent).toContain('Enter between 1 and 10 specialisations.');
  });

  it('sends only dirty/changed fields (excluding email) on save', async () => {
    fixture.detectChanges();
    http.expectOne(USERS_ME_URL).flush({ user: MOCK_DOCTOR });
    await fixture.whenStable();
    fixture.detectChanges();

    // Edit only qualification
    const qualInput = page.querySelector<HTMLInputElement>('#doctor-qualification')!;
    qualInput.value = 'MBBS, MD, FACC';
    qualInput.dispatchEvent(new Event('input'));

    await fixture.whenStable();
    fixture.detectChanges();

    const saveButton = page.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(saveButton.disabled).toBe(false);

    // Submit form
    page.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    const putReq = http.expectOne(USERS_ME_URL);
    expect(putReq.request.method).toBe('PUT');
    // Strictly ONLY qualification is sent; name, email, phone and specialisations are omitted!
    expect(putReq.request.body).toEqual({ qualification: 'MBBS, MD, FACC' });

    putReq.flush({
      user: {
        ...MOCK_DOCTOR,
        qualification: 'MBBS, MD, FACC',
      },
    });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.textContent).toContain('Profile updated successfully.');
    expect(saveButton.disabled).toBe(true);
  });

  it('shows server error message as written with role="alert" on update failure', async () => {
    fixture.detectChanges();
    http.expectOne(USERS_ME_URL).flush({ user: MOCK_DOCTOR });
    await fixture.whenStable();
    fixture.detectChanges();

    const nameInput = page.querySelector<HTMLInputElement>('#doctor-name')!;
    nameInput.value = 'Dr. Sarah Connor';
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
    http.expectOne(USERS_ME_URL).flush({ user: MOCK_DOCTOR });
    await fixture.whenStable();
    fixture.detectChanges();

    const specInput = page.querySelector<HTMLInputElement>('#doctor-specialisations')!;
    specInput.value = 'Neurology';
    specInput.dispatchEvent(new Event('input'));

    await fixture.whenStable();
    fixture.detectChanges();

    const cancelBtn = page.querySelector<HTMLButtonElement>('.button-secondary')!;
    expect(cancelBtn).not.toBeNull();
    cancelBtn.click();

    await fixture.whenStable();
    fixture.detectChanges();

    expect(specInput.value).toBe('Cardiology, Internal Medicine');
    expect(page.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
  });

  it('verifies route guard configuration for /doctor/profile', () => {
    const route = routes.find((r) => r.path === 'doctor/profile');
    expect(route).toBeDefined();
    expect(route?.title).toBe('Doctor profile | MediSync');
    expect(route?.canActivate).toBeDefined();
    expect(route?.canActivate?.length).toBeGreaterThan(0);
  });
});
