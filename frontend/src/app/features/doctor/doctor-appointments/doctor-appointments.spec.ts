import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { environment } from '../../../../environments/environment';
import { fakeJwt } from '../../../core/auth/testing';
import { DoctorAppointments } from './doctor-appointments';

const APPOINTMENTS_URL = `${environment.apiUrl}/appointments`;

describe('DoctorAppointments Component', () => {
  let fixture: ComponentFixture<DoctorAppointments>;
  let component: DoctorAppointments;
  let page: HTMLElement;
  let http: HttpTestingController;

  const futureStart = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const futureEnd = new Date(Date.now() + 24.5 * 3600 * 1000).toISOString();
  const pastStart = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const pastEnd = new Date(Date.now() - 1.5 * 3600 * 1000).toISOString();

  const mockAppointmentsResponse = {
    appointments: [
      {
        id: 'apt-1',
        patient: { id: 'pat-1', name: 'Alice Smith' },
        dateTime: futureStart,
        endTime: futureEnd,
        status: 'requested',
      },
      {
        id: 'apt-2',
        patient: { id: 'pat-2', name: 'Bob Jones' },
        dateTime: pastStart,
        endTime: pastEnd,
        status: 'confirmed',
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
        id: 'doc-1',
        name: 'Dr. Sarah Connor',
        email: 'doctor@example.com',
        role: 'doctor',
      }),
    );

    await TestBed.configureTestingModule({
      imports: [DoctorAppointments],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(DoctorAppointments);
    component = fixture.componentInstance;
    page = fixture.nativeElement as HTMLElement;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('loads and displays doctor appointments on initialization', async () => {
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

    expect(page.textContent).toContain('Alice Smith');
    expect(page.textContent).toContain('Bob Jones');
    expect(page.querySelectorAll('.appointment-card')).toHaveLength(2);
  });

  it('filters appointments by switching to Past timeline tab', async () => {
    fixture.detectChanges();

    const req1 = http.expectOne((r) => r.url === APPOINTMENTS_URL && r.params.get('when') === 'upcoming');
    req1.flush(mockAppointmentsResponse);

    await fixture.whenStable();
    fixture.detectChanges();

    const pastTab = page.querySelectorAll<HTMLButtonElement>('.tab-button')[1];
    pastTab.click();
    fixture.detectChanges();

    const req2 = http.expectOne((r) => r.url === APPOINTMENTS_URL && r.params.get('when') === 'past');
    expect(req2.request.method).toBe('GET');
    req2.flush({
      appointments: [mockAppointmentsResponse.appointments[1]],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.querySelectorAll('.appointment-card')).toHaveLength(1);
  });

  it('doctor accepts a requested appointment', async () => {
    fixture.detectChanges();

    const req1 = http.expectOne((r) => r.url === APPOINTMENTS_URL);
    req1.flush(mockAppointmentsResponse);

    await fixture.whenStable();
    fixture.detectChanges();

    // Click Accept button on requested appointment
    const acceptBtn = page.querySelector<HTMLButtonElement>('.button-accept')!;
    expect(acceptBtn).toBeTruthy();
    acceptBtn.click();
    fixture.detectChanges();

    const patchReq = http.expectOne(`${APPOINTMENTS_URL}/apt-1`);
    expect(patchReq.request.method).toBe('PATCH');
    expect(patchReq.request.body).toEqual({ action: 'accept' });
    patchReq.flush({
      appointment: {
        id: 'apt-1',
        patient: { id: 'pat-1', name: 'Alice Smith' },
        dateTime: futureStart,
        endTime: futureEnd,
        status: 'confirmed',
      },
    });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.textContent).toContain('Appointment accepted and confirmed.');
    expect(page.textContent).toContain('Confirmed');
  });

  it('doctor rejects a requested appointment with confirmation modal', async () => {
    fixture.detectChanges();

    const req1 = http.expectOne((r) => r.url === APPOINTMENTS_URL);
    req1.flush(mockAppointmentsResponse);

    await fixture.whenStable();
    fixture.detectChanges();

    // Click Reject button
    const rejectBtn = page.querySelector<HTMLButtonElement>('.button-danger')!;
    expect(rejectBtn).toBeTruthy();
    rejectBtn.click();
    fixture.detectChanges();

    // Modal dialog is shown
    const modal = page.querySelector('.modal-dialog');
    expect(modal).toBeTruthy();
    expect(modal?.textContent).toContain('Reject appointment request');

    // Confirm rejection
    const confirmBtn = page.querySelector<HTMLButtonElement>('.modal-actions .button-danger')!;
    confirmBtn.click();
    fixture.detectChanges();

    const patchReq = http.expectOne(`${APPOINTMENTS_URL}/apt-1`);
    expect(patchReq.request.method).toBe('PATCH');
    expect(patchReq.request.body).toEqual({ action: 'reject' });
    patchReq.flush({
      appointment: {
        id: 'apt-1',
        patient: { id: 'pat-1', name: 'Alice Smith' },
        dateTime: futureStart,
        endTime: futureEnd,
        status: 'cancelled',
      },
    });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.querySelector('.modal-dialog')).toBeNull();
    expect(page.textContent).toContain('Appointment rejected. The time slot has been released.');
  });

  it('doctor marks a confirmed past appointment as completed', async () => {
    fixture.detectChanges();

    const req1 = http.expectOne((r) => r.url === APPOINTMENTS_URL);
    req1.flush(mockAppointmentsResponse);

    await fixture.whenStable();
    fixture.detectChanges();

    // Click Mark completed on past confirmed appointment
    const completeBtn = page.querySelector<HTMLButtonElement>('.button-complete')!;
    expect(completeBtn).toBeTruthy();
    completeBtn.click();
    fixture.detectChanges();

    const patchReq = http.expectOne(`${APPOINTMENTS_URL}/apt-2`);
    expect(patchReq.request.method).toBe('PATCH');
    expect(patchReq.request.body).toEqual({ action: 'complete' });
    patchReq.flush({
      appointment: {
        id: 'apt-2',
        patient: { id: 'pat-2', name: 'Bob Jones' },
        dateTime: pastStart,
        endTime: pastEnd,
        status: 'completed',
      },
    });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.textContent).toContain('Appointment marked as completed.');
  });

  it('displays empty state card when doctor has no appointments', async () => {
    fixture.detectChanges();

    const req = http.expectOne((r) => r.url === APPOINTMENTS_URL);
    req.flush({ appointments: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.textContent).toContain('No appointments found');
    expect(page.querySelector('.empty-actions a')?.getAttribute('routerLink')).toBe('/doctor/availability');
  });

  it('renders a Chat button only for confirmed or completed appointments', async () => {
    fixture.detectChanges();

    const req = http.expectOne((r) => r.url === APPOINTMENTS_URL);
    req.flush(mockAppointmentsResponse);

    await fixture.whenStable();
    fixture.detectChanges();

    // apt-1 is requested -> no chat button
    // apt-2 is confirmed -> has chat button
    const cards = page.querySelectorAll('.appointment-card');
    const apt1ChatBtn = cards[0].querySelector('.button-chat');
    const apt2ChatBtn = cards[1].querySelector('.button-chat');

    expect(apt1ChatBtn).toBeNull();
    expect(apt2ChatBtn).not.toBeNull();
    expect(apt2ChatBtn?.getAttribute('href')).toBe('/appointments/apt-2/chat');
  });
});
