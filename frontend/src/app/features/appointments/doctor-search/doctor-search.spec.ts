import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { routes } from '../../../app.routes';
import { environment } from '../../../../environments/environment';
import { fakeJwt } from '../../../core/auth/testing';
import { DoctorSearch } from './doctor-search';

const DOCTORS_URL = `${environment.apiUrl}/doctors`;

describe('DoctorSearch Component', () => {
  let fixture: ComponentFixture<DoctorSearch>;
  let component: DoctorSearch;
  let page: HTMLElement;
  let http: HttpTestingController;

  const mockDoctorsResponse = {
    doctors: [
      {
        id: 'doc-1',
        name: 'Dr. Sarah Smith',
        specialisations: ['Cardiology', 'Internal Medicine'],
        qualification: 'MBBS, MD',
      },
      {
        id: 'doc-2',
        name: 'Dr. John Watson',
        specialisations: ['General Medicine'],
        qualification: 'MBBS',
      },
    ],
    pagination: {
      page: 1,
      limit: 10,
      total: 2,
      totalPages: 1,
    },
  };

  beforeEach(async () => {
    localStorage.setItem('medisync.token', fakeJwt(3600));
    localStorage.setItem(
      'medisync.user',
      JSON.stringify({ id: 'pat-1', name: 'Jane Patient', email: 'pat@example.com', role: 'patient' }),
    );

    await TestBed.configureTestingModule({
      imports: [DoctorSearch],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(DoctorSearch);
    component = fixture.componentInstance;
    page = fixture.nativeElement as HTMLElement;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('loads and displays active doctors on init', async () => {
    fixture.detectChanges();

    const req = http.expectOne((r) => r.url === DOCTORS_URL && r.params.get('page') === '1');
    expect(req.request.method).toBe('GET');
    req.flush(mockDoctorsResponse);

    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.textContent).toContain('Find a Doctor');
    expect(page.textContent).toContain('Dr. Sarah Smith');
    expect(page.textContent).toContain('MBBS, MD');
    expect(page.textContent).toContain('Cardiology');
    expect(page.textContent).toContain('Dr. John Watson');
    expect(page.querySelectorAll('.doctor-card')).toHaveLength(2);
  });

  it('submits search form and sends only allowed non-empty query parameters', async () => {
    fixture.detectChanges();
    http.expectOne((r) => r.url === DOCTORS_URL && r.params.get('page') === '1').flush(mockDoctorsResponse);

    await fixture.whenStable();

    // Type search parameters
    const nameInput = page.querySelector<HTMLInputElement>('#doctor-name')!;
    nameInput.value = 'Sarah';
    nameInput.dispatchEvent(new Event('input'));

    const specInput = page.querySelector<HTMLInputElement>('#doctor-specialisation')!;
    specInput.value = 'Cardio';
    specInput.dispatchEvent(new Event('input'));

    page.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    const searchReq = http.expectOne(
      (r) =>
        r.url === DOCTORS_URL &&
        r.params.get('name') === 'Sarah' &&
        r.params.get('specialisation') === 'Cardio' &&
        r.params.get('page') === '1',
    );
    expect(searchReq.request.method).toBe('GET');
    searchReq.flush({
      doctors: [mockDoctorsResponse.doctors[0]],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.textContent).toContain('Dr. Sarah Smith');
    expect(page.querySelectorAll('.doctor-card')).toHaveLength(1);
  });

  it('displays empty state when no doctors match the search criteria', async () => {
    fixture.detectChanges();

    http.expectOne((r) => r.url === DOCTORS_URL && r.params.get('page') === '1').flush({
      doctors: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
    });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.textContent).toContain('No doctors found');
    expect(page.textContent).toContain('No active doctors match your search criteria.');
  });

  it('handles pagination navigation and disables buttons on edge pages', async () => {
    fixture.detectChanges();

    http.expectOne((r) => r.url === DOCTORS_URL && r.params.get('page') === '1').flush({
      doctors: [mockDoctorsResponse.doctors[0]],
      pagination: { page: 1, limit: 10, total: 25, totalPages: 3 },
    });

    await fixture.whenStable();
    fixture.detectChanges();

    const prevBtn = page.querySelector<HTMLButtonElement>('button[aria-label="Previous page"]')!;
    const nextBtn = page.querySelector<HTMLButtonElement>('button[aria-label="Next page"]')!;

    expect(prevBtn.disabled).toBe(true);
    expect(nextBtn.disabled).toBe(false);
    expect(page.textContent).toContain('Page 1 of 3');

    // Click Next page
    nextBtn.click();
    await fixture.whenStable();

    const page2Req = http.expectOne((r) => r.url === DOCTORS_URL && r.params.get('page') === '2');
    page2Req.flush({
      doctors: [mockDoctorsResponse.doctors[1]],
      pagination: { page: 2, limit: 10, total: 25, totalPages: 3 },
    });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.textContent).toContain('Page 2 of 3');
  });

  it('resets search filters and reloads page 1', async () => {
    fixture.detectChanges();
    http.expectOne((r) => r.url === DOCTORS_URL && r.params.get('page') === '1').flush(mockDoctorsResponse);

    await fixture.whenStable();

    const nameInput = page.querySelector<HTMLInputElement>('#doctor-name')!;
    nameInput.value = 'Sarah';
    nameInput.dispatchEvent(new Event('input'));

    const resetBtn = page.querySelector<HTMLButtonElement>('.button-secondary')!;
    resetBtn.click();
    await fixture.whenStable();

    const resetReq = http.expectOne((r) => r.url === DOCTORS_URL && !r.params.has('name'));
    resetReq.flush(mockDoctorsResponse);

    expect(nameInput.value).toBe('');
  });

  it('shows server error message as written with role="alert" on failure', async () => {
    fixture.detectChanges();

    const req = http.expectOne((r) => r.url === DOCTORS_URL && r.params.get('page') === '1');
    req.flush(
      { message: 'Database connection failed', code: 'INTERNAL_ERROR' },
      { status: 500, statusText: 'Server Error' },
    );

    await fixture.whenStable();
    fixture.detectChanges();

    const alert = page.querySelector('.error-box')!;
    expect(alert).not.toBeNull();
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.textContent).toContain('Database connection failed');
  });

  it('shows friendly connection error when server cannot be reached (status 0)', async () => {
    fixture.detectChanges();

    const req = http.expectOne((r) => r.url === DOCTORS_URL && r.params.get('page') === '1');
    req.error(new ProgressEvent('error'));

    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.textContent).toContain('Cannot reach the server. Please try again.');
  });

  it('verifies route guard configuration for /patient/doctors', () => {
    const route = routes.find((r) => r.path === 'patient/doctors');
    expect(route).toBeDefined();
    expect(route?.title).toBe('Find a doctor | MediSync');
    expect(route?.canActivate).toBeDefined();
    expect(route?.canActivate?.length).toBeGreaterThan(0);
  });
});
