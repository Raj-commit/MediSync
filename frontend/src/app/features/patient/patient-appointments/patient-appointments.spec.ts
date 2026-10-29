import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { environment } from '../../../../environments/environment';
import { fakeJwt } from '../../../core/auth/testing';
import { PatientAppointments } from './patient-appointments';

const APPOINTMENTS_URL = `${environment.apiUrl}/appointments`;
const DOCTORS_URL = `${environment.apiUrl}/doctors`;

describe('PatientAppointments Component', () => {
  let fixture: ComponentFixture<PatientAppointments>;
  let component: PatientAppointments;
  let page: HTMLElement;
  let http: HttpTestingController;

  const futureStart = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const futureEnd = new Date(Date.now() + 24.5 * 3600 * 1000).toISOString();

  const mockAppointmentsResponse = {
    appointments: [
      {
        id: 'apt-1',
        doctor: { id: 'doc-1', name: 'Dr. Sarah Connor' },
        dateTime: futureStart,
        endTime: futureEnd,
        status: 'confirmed',
      },
      {
        id: 'apt-2',
        doctor: { id: 'doc-2', name: 'Dr. John Watson' },
        dateTime: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
        endTime: new Date(Date.now() + 48.5 * 3600 * 1000).toISOString(),
        status: 'requested',
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
      JSON.stringify({
        id: 'pat-1',
        name: 'Jane Patient',
        email: 'patient@example.com',
        role: 'patient',
      }),
    );

    await TestBed.configureTestingModule({
      imports: [PatientAppointments],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(PatientAppointments);
    component = fixture.componentInstance;
    page = fixture.nativeElement as HTMLElement;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('loads and displays upcoming appointments on initialization', async () => {
    fixture.detectChanges();

    const req = http.expectOne(
      (r) =>
        r.url === APPOINTMENTS_URL &&
        r.params.get('when') === 'upcoming' &&
        r.params.get('page') === '1',
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockAppointmentsResponse);

    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.textContent).toContain('Dr. Sarah Connor');
    expect(page.textContent).toContain('Dr. John Watson');
    expect(page.querySelectorAll('.appointment-card')).toHaveLength(2);
  });

  it('switches tabs to past appointments and requests when=past', async () => {
    fixture.detectChanges();

    // Initial load
    const req1 = http.expectOne((r) => r.url === APPOINTMENTS_URL && r.params.get('when') === 'upcoming');
    req1.flush(mockAppointmentsResponse);

    await fixture.whenStable();
    fixture.detectChanges();

    // Click Past tab
    const pastTab = page.querySelectorAll<HTMLButtonElement>('.tab-button')[1];
    pastTab.click();
    fixture.detectChanges();

    const req2 = http.expectOne((r) => r.url === APPOINTMENTS_URL && r.params.get('when') === 'past');
    expect(req2.request.method).toBe('GET');
    req2.flush({
      appointments: [
        {
          id: 'apt-past',
          doctor: { id: 'doc-1', name: 'Dr. Sarah Connor' },
          dateTime: '2026-10-01T10:00:00.000Z',
          endTime: '2026-10-01T10:30:00.000Z',
          status: 'completed',
        },
      ],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.textContent).toContain('Completed');
    expect(page.querySelectorAll('.appointment-card')).toHaveLength(1);
  });

  it('filters appointments by status dropdown', async () => {
    fixture.detectChanges();

    const req1 = http.expectOne((r) => r.url === APPOINTMENTS_URL);
    req1.flush(mockAppointmentsResponse);

    await fixture.whenStable();
    fixture.detectChanges();

    const select = page.querySelector<HTMLSelectElement>('#status-select')!;
    select.value = 'confirmed';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const req2 = http.expectOne(
      (r) =>
        r.url === APPOINTMENTS_URL &&
        r.params.get('status') === 'confirmed' &&
        r.params.get('when') === 'upcoming',
    );
    expect(req2.request.method).toBe('GET');
    req2.flush({
      appointments: [mockAppointmentsResponse.appointments[0]],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.querySelectorAll('.appointment-card')).toHaveLength(1);
  });

  it('displays empty state card when no appointments match', async () => {
    fixture.detectChanges();

    const req = http.expectOne((r) => r.url === APPOINTMENTS_URL);
    req.flush({ appointments: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.textContent).toContain('No appointments found');
    expect(page.querySelector('.empty-actions a')?.getAttribute('routerLink')).toBe('/patient/doctors');
  });

  it('displays error box when API fails and retries on click', async () => {
    fixture.detectChanges();

    const req1 = http.expectOne((r) => r.url === APPOINTMENTS_URL);
    req1.flush({ message: 'Database connection failed' }, { status: 500, statusText: 'Server Error' });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.textContent).toContain('Database connection failed');
    const retryBtn = page.querySelector<HTMLButtonElement>('.error-box button')!;
    expect(retryBtn).toBeTruthy();

    retryBtn.click();
    fixture.detectChanges();

    const req2 = http.expectOne((r) => r.url === APPOINTMENTS_URL);
    req2.flush(mockAppointmentsResponse);

    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.querySelectorAll('.appointment-card')).toHaveLength(2);
  });

  it('cancels an appointment after user confirmation in modal', async () => {
    fixture.detectChanges();

    const req1 = http.expectOne((r) => r.url === APPOINTMENTS_URL);
    req1.flush(mockAppointmentsResponse);

    await fixture.whenStable();
    fixture.detectChanges();

    // Click Cancel on first appointment
    const cancelBtn = page.querySelector<HTMLButtonElement>('.button-danger')!;
    cancelBtn.click();
    fixture.detectChanges();

    // Modal dialog is shown
    const modal = page.querySelector('.modal-dialog');
    expect(modal).toBeTruthy();
    expect(modal?.textContent).toContain('Are you sure you want to cancel');

    // Confirm cancel
    const confirmBtn = page.querySelector<HTMLButtonElement>('.modal-actions .button-danger')!;
    confirmBtn.click();
    fixture.detectChanges();

    const req2 = http.expectOne(`${APPOINTMENTS_URL}/apt-1`);
    expect(req2.request.method).toBe('PATCH');
    expect(req2.request.body).toEqual({ action: 'cancel' });
    req2.flush({
      appointment: {
        id: 'apt-1',
        doctor: { id: 'doc-1', name: 'Dr. Sarah Connor' },
        dateTime: futureStart,
        endTime: futureEnd,
        status: 'cancelled',
      },
    });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.querySelector('.modal-dialog')).toBeNull();
    expect(page.textContent).toContain('Appointment cancelled successfully.');
  });

  it('reschedules an appointment inline and handles 409 SLOT_TAKEN by reloading slots', async () => {
    fixture.detectChanges();

    const req1 = http.expectOne((r) => r.url === APPOINTMENTS_URL);
    req1.flush(mockAppointmentsResponse);

    await fixture.whenStable();
    fixture.detectChanges();

    // Click Reschedule on first card
    const rescheduleToggle = page.querySelector<HTMLButtonElement>('.appointment-actions .button-secondary')!;
    rescheduleToggle.click();
    fixture.detectChanges();

    // Expect doctor's availability request
    const availReq = http.expectOne(`${DOCTORS_URL}/doc-1/availability`);
    expect(availReq.request.method).toBe('GET');

    const slot1 = 'slot-new-1';
    const slotTime = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
    availReq.flush({
      doctor: { id: 'doc-1', name: 'Dr. Sarah Connor' },
      slots: [
        {
          id: slot1,
          startTime: slotTime,
          endTime: new Date(Date.now() + 72.5 * 3600 * 1000).toISOString(),
          isBooked: false,
        },
      ],
    });

    await fixture.whenStable();
    fixture.detectChanges();

    // Drawer is rendered
    expect(page.querySelector('.reschedule-drawer')).toBeTruthy();
    const slotBtn = page.querySelector<HTMLButtonElement>('.slot-btn')!;
    slotBtn.click();
    fixture.detectChanges();

    // Click Confirm reschedule
    const confirmRescheduleBtn = page.querySelector<HTMLButtonElement>('.reschedule-actions .button')!;
    confirmRescheduleBtn.click();
    fixture.detectChanges();

    const patchReq = http.expectOne(`${APPOINTMENTS_URL}/apt-1`);
    expect(patchReq.request.method).toBe('PATCH');
    expect(patchReq.request.body).toEqual({ action: 'reschedule', slotId: slot1 });

    // Simulate 409 conflict
    patchReq.flush(
      { message: 'This slot is already booked', code: 'SLOT_TAKEN' },
      { status: 409, statusText: 'Conflict' },
    );

    // Availability reloaded automatically
    const reloadReq = http.expectOne(`${DOCTORS_URL}/doc-1/availability`);
    expect(reloadReq.request.method).toBe('GET');
    reloadReq.flush({ doctor: { id: 'doc-1', name: 'Dr. Sarah Connor' }, slots: [] });

    await fixture.whenStable();
    fixture.detectChanges();

    // Error banner displayed and availability reloaded automatically
    expect(page.textContent).toContain('This slot is already booked');
  });

  it('renders a Chat button only for confirmed or completed appointments', async () => {
    fixture.detectChanges();

    const req = http.expectOne(
      (r) => r.url === APPOINTMENTS_URL && r.params.get('when') === 'upcoming',
    );
    req.flush(mockAppointmentsResponse);

    await fixture.whenStable();
    fixture.detectChanges();

    // apt-1 is confirmed -> has chat button
    // apt-2 is requested -> no chat button
    const cards = page.querySelectorAll('.appointment-card');
    const apt1ChatBtn = cards[0].querySelector('.button-chat');
    const apt2ChatBtn = cards[1].querySelector('.button-chat');

    expect(apt1ChatBtn).not.toBeNull();
    expect(apt1ChatBtn?.getAttribute('href')).toBe('/appointments/apt-1/chat');
    expect(apt2ChatBtn).toBeNull();
  });
});
