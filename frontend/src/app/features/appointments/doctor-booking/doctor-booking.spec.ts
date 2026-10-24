import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';

import { routes } from '../../../app.routes';
import { environment } from '../../../../environments/environment';
import { fakeJwt } from '../../../core/auth/testing';
import { DoctorBooking } from './doctor-booking';

const DOCTORS_URL = `${environment.apiUrl}/doctors`;
const APPOINTMENTS_URL = `${environment.apiUrl}/appointments`;

describe('DoctorBooking Component', () => {
  let fixture: ComponentFixture<DoctorBooking>;
  let component: DoctorBooking;
  let page: HTMLElement;
  let http: HttpTestingController;

  const DOCTOR_ID = 'doc-123';
  const SLOT_ID_1 = 'slot-101';
  const SLOT_ID_2 = 'slot-102';

  // Future UTC dates for slots
  const futureIsoStart1 = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const futureIsoEnd1 = new Date(Date.now() + 24.5 * 3600 * 1000).toISOString();
  const futureIsoStart2 = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
  const futureIsoEnd2 = new Date(Date.now() + 48.5 * 3600 * 1000).toISOString();

  const mockAvailabilityResponse = {
    doctor: {
      id: DOCTOR_ID,
      name: 'Dr. Sarah Connor',
    },
    slots: [
      {
        id: SLOT_ID_1,
        startTime: futureIsoStart1,
        endTime: futureIsoEnd1,
        isBooked: false,
      },
      {
        id: SLOT_ID_2,
        startTime: futureIsoStart2,
        endTime: futureIsoEnd2,
        isBooked: false,
      },
    ],
  };

  beforeEach(async () => {
    localStorage.setItem('medisync.token', fakeJwt(3600));
    localStorage.setItem(
      'medisync.user',
      JSON.stringify({ id: 'pat-1', name: 'Jane Patient', email: 'pat@example.com', role: 'patient' }),
    );

    await TestBed.configureTestingModule({
      imports: [DoctorBooking],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: (key: string) => (key === 'id' ? DOCTOR_ID : null),
              },
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DoctorBooking);
    component = fixture.componentInstance;
    page = fixture.nativeElement as HTMLElement;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('loads and displays open availability slots grouped by local day', async () => {
    fixture.detectChanges();

    const req = http.expectOne(`${DOCTORS_URL}/${DOCTOR_ID}/availability`);
    expect(req.request.method).toBe('GET');
    req.flush(mockAvailabilityResponse);

    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.textContent).toContain('Dr. Sarah Connor');
    expect(page.querySelectorAll('.day-group-card')).toHaveLength(2);
    expect(page.querySelectorAll('.slot-btn')).toHaveLength(2);
  });

  it('displays empty state when doctor has no open slots', async () => {
    fixture.detectChanges();

    http.expectOne(`${DOCTORS_URL}/${DOCTOR_ID}/availability`).flush({
      doctor: { id: DOCTOR_ID, name: 'Dr. Sarah Connor' },
      slots: [],
    });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.textContent).toContain('No open slots');
    expect(page.textContent).toContain('This doctor currently has no open consultation slots available.');
  });

  it('selects an open slot and displays the selection summary bar', async () => {
    fixture.detectChanges();
    http.expectOne(`${DOCTORS_URL}/${DOCTOR_ID}/availability`).flush(mockAvailabilityResponse);

    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.querySelector('.selection-bar')).toBeNull();

    // Click the first slot
    const slotButtons = page.querySelectorAll<HTMLButtonElement>('.slot-btn');
    slotButtons[0].click();

    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.querySelector('.selection-bar')).not.toBeNull();
    expect(slotButtons[0].classList.contains('is-selected')).toBe(true);
    expect(slotButtons[0].getAttribute('aria-pressed')).toBe('true');
  });

  it('books the selected slot sending { doctorId, slotId } and shows in-page confirmation on 201', async () => {
    fixture.detectChanges();
    http.expectOne(`${DOCTORS_URL}/${DOCTOR_ID}/availability`).flush(mockAvailabilityResponse);

    await fixture.whenStable();
    fixture.detectChanges();

    // Select first slot
    const slotBtn = page.querySelector<HTMLButtonElement>('.slot-btn')!;
    slotBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    // Click Confirm and Book
    const confirmBtn = page.querySelector<HTMLButtonElement>('.button-book')!;
    confirmBtn.click();

    const bookReq = http.expectOne(APPOINTMENTS_URL);
    expect(bookReq.request.method).toBe('POST');
    expect(bookReq.request.body).toEqual({
      doctorId: DOCTOR_ID,
      slotId: SLOT_ID_1,
    });

    bookReq.flush(
      {
        appointment: {
          id: 'appt-999',
          doctor: { id: DOCTOR_ID, name: 'Dr. Sarah Connor' },
          dateTime: futureIsoStart1,
          endTime: futureIsoEnd1,
          status: 'requested',
        },
      },
      { status: 201, statusText: 'Created' },
    );

    await fixture.whenStable();
    fixture.detectChanges();

    // Confirmation View should be displayed
    expect(page.querySelector('.confirmation-card')).not.toBeNull();
    expect(page.textContent).toContain('Appointment Requested');
    expect(page.textContent).toContain('Dr. Sarah Connor');
    expect(page.textContent).toContain('requested');
    expect(page.textContent).toContain('The doctor must review and accept your request');
    expect(page.querySelector('a[routerLink="/patient/doctors"]')).not.toBeNull();
    expect(page.querySelector('a[routerLink="/patient"]')).not.toBeNull();

    // Slot list should be hidden
    expect(page.querySelector('.slots-section')).toBeNull();
  });

  it('handles 409 SLOT_TAKEN by showing error message, clearing selection, and reloading slots', async () => {
    fixture.detectChanges();
    http.expectOne(`${DOCTORS_URL}/${DOCTOR_ID}/availability`).flush(mockAvailabilityResponse);

    await fixture.whenStable();
    fixture.detectChanges();

    // Select first slot and confirm
    page.querySelector<HTMLButtonElement>('.slot-btn')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    page.querySelector<HTMLButtonElement>('.button-book')!.click();

    const bookReq = http.expectOne(APPOINTMENTS_URL);
    bookReq.flush(
      { message: 'This slot is already booked', code: 'SLOT_TAKEN' },
      { status: 409, statusText: 'Conflict' },
    );

    // After 409, it should trigger reloading of availability slots
    const reloadReq = http.expectOne(`${DOCTORS_URL}/${DOCTOR_ID}/availability`);
    // Return slots with slot 1 gone
    reloadReq.flush({
      doctor: { id: DOCTOR_ID, name: 'Dr. Sarah Connor' },
      slots: [mockAvailabilityResponse.slots[1]],
    });

    await fixture.whenStable();
    fixture.detectChanges();

    // Check error banner displayed
    const errorAlert = page.querySelector('.booking-error')!;
    expect(errorAlert).not.toBeNull();
    expect(errorAlert.getAttribute('role')).toBe('alert');
    expect(errorAlert.textContent).toContain('This slot is already booked');

    // Selection bar should be dismissed
    expect(page.querySelector('.selection-bar')).toBeNull();

    // Slots reloaded with only 1 remaining open slot
    expect(page.querySelectorAll('.slot-btn')).toHaveLength(1);
  });

  it('disables the book button while submission is in-flight', async () => {
    fixture.detectChanges();
    http.expectOne(`${DOCTORS_URL}/${DOCTOR_ID}/availability`).flush(mockAvailabilityResponse);

    await fixture.whenStable();
    fixture.detectChanges();

    page.querySelector<HTMLButtonElement>('.slot-btn')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const bookBtn = page.querySelector<HTMLButtonElement>('.button-book')!;
    bookBtn.click();
    fixture.detectChanges();

    expect(bookBtn.disabled).toBe(true);
    expect(bookBtn.textContent).toContain('Booking...');

    http.expectOne(APPOINTMENTS_URL).flush({
      appointment: {
        id: 'appt-1',
        doctor: { id: DOCTOR_ID, name: 'Dr. Sarah Connor' },
        dateTime: futureIsoStart1,
        endTime: futureIsoEnd1,
        status: 'requested',
      },
    });
  });

  it('shows friendly connection error when server cannot be reached (status 0)', async () => {
    fixture.detectChanges();

    const req = http.expectOne(`${DOCTORS_URL}/${DOCTOR_ID}/availability`);
    req.error(new ProgressEvent('error'));

    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.textContent).toContain('Cannot reach the server. Please try again.');
  });

  it('verifies route guard configuration for /patient/doctors/:id', () => {
    const route = routes.find((r) => r.path === 'patient/doctors/:id');
    expect(route).toBeDefined();
    expect(route?.title).toBe('Book appointment | MediSync');
    expect(route?.canActivate).toBeDefined();
    expect(route?.canActivate?.length).toBeGreaterThan(0);
  });
});
