import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { routes } from '../../../app.routes';
import { environment } from '../../../../environments/environment';
import { fakeJwt } from '../../../core/auth/testing';
import { Availability } from './availability';

const AVAILABILITY_URL = `${environment.apiUrl}/doctors/me/availability`;

describe('Availability Component', () => {
  let fixture: ComponentFixture<Availability>;
  let component: Availability;
  let page: HTMLElement;
  let http: HttpTestingController;

  function futureDateString(daysAhead: number = 2): string {
    const d = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  beforeEach(async () => {
    localStorage.setItem('medisync.token', fakeJwt(3600));
    localStorage.setItem(
      'medisync.user',
      JSON.stringify({ id: 'doc-1', name: 'Dr. Test', email: 'doc@example.com', role: 'doctor' }),
    );

    await TestBed.configureTestingModule({
      imports: [Availability],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(Availability);
    component = fixture.componentInstance;
    page = fixture.nativeElement as HTMLElement;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('loads and displays availability slots on init', async () => {
    fixture.detectChanges();

    const getReq = http.expectOne(AVAILABILITY_URL);
    expect(getReq.request.method).toBe('GET');

    const futureIsoStart = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const futureIsoEnd = new Date(Date.now() + 48.5 * 3600 * 1000).toISOString();

    getReq.flush({
      slots: [
        {
          id: 'slot-1',
          startTime: futureIsoStart,
          endTime: futureIsoEnd,
          isBooked: false,
        },
      ],
    });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.textContent).toContain('Doctor Availability');
    expect(page.textContent).toContain('Open');
    expect(page.querySelector('.slot-item.is-open')).not.toBeNull();
  });

  it('displays empty state when doctor has no future slots', async () => {
    fixture.detectChanges();

    const getReq = http.expectOne(AVAILABILITY_URL);
    getReq.flush({ slots: [] });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.textContent).toContain('No upcoming availability');
  });

  it('ensures booked slots cannot be removed and have locked indicators', async () => {
    fixture.detectChanges();

    const getReq = http.expectOne(AVAILABILITY_URL);
    const start1 = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const end1 = new Date(Date.now() + 24.5 * 3600 * 1000).toISOString();
    const start2 = new Date(Date.now() + 25 * 3600 * 1000).toISOString();
    const end2 = new Date(Date.now() + 25.5 * 3600 * 1000).toISOString();

    getReq.flush({
      slots: [
        { id: 'open-1', startTime: start1, endTime: end1, isBooked: false },
        { id: 'booked-1', startTime: start2, endTime: end2, isBooked: true },
      ],
    });

    await fixture.whenStable();
    fixture.detectChanges();

    const openItem = page.querySelector('.slot-item.is-open')!;
    const bookedItem = page.querySelector('.slot-item.is-booked')!;

    // Open slot must have a remove button
    expect(openItem.querySelector('.button-remove')).not.toBeNull();

    // Booked slot must NOT have a remove button and must have Locked indicator
    expect(bookedItem.querySelector('.button-remove')).toBeNull();
    expect(bookedItem.querySelector('.locked-note')?.textContent).toContain('Locked');
    expect(bookedItem.textContent).toContain('Booked');
  });

  it('removes an open slot when remove button is clicked', async () => {
    fixture.detectChanges();

    const getReq = http.expectOne(AVAILABILITY_URL);
    const start1 = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const end1 = new Date(Date.now() + 24.5 * 3600 * 1000).toISOString();

    getReq.flush({
      slots: [{ id: 'open-1', startTime: start1, endTime: end1, isBooked: false }],
    });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.querySelectorAll('.slot-item')).toHaveLength(1);

    const removeBtn = page.querySelector<HTMLButtonElement>('.button-remove')!;
    removeBtn.click();

    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.querySelectorAll('.slot-item')).toHaveLength(0);
    expect(page.textContent).toContain('Unsaved Changes');
  });

  it('never sends booked slots in the PUT request body when saving', async () => {
    fixture.detectChanges();

    const getReq = http.expectOne(AVAILABILITY_URL);
    const startOpen = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const endOpen = new Date(Date.now() + 24.5 * 3600 * 1000).toISOString();
    const startBooked = new Date(Date.now() + 25 * 3600 * 1000).toISOString();
    const endBooked = new Date(Date.now() + 25.5 * 3600 * 1000).toISOString();

    getReq.flush({
      slots: [
        { id: 'open-1', startTime: startOpen, endTime: endOpen, isBooked: false },
        { id: 'booked-1', startTime: startBooked, endTime: endBooked, isBooked: true },
      ],
    });

    await fixture.whenStable();
    fixture.detectChanges();

    // Generate another slot
    component.generatorForm.setValue({
      date: futureDateString(3),
      startTime: '10:00',
      endTime: '10:30',
    });

    component['onGenerateSlots']();
    await fixture.whenStable();
    fixture.detectChanges();

    // Click Save Changes
    const saveBtn = page.querySelector<HTMLButtonElement>('.button-save')!;
    saveBtn.click();

    const putReq = http.expectOne(AVAILABILITY_URL);
    expect(putReq.request.method).toBe('PUT');

    // PUT body must ONLY contain open slots, NEVER the booked slot
    const putSlots: Array<{ startTime: string; endTime: string }> = putReq.request.body.slots;
    expect(putSlots.some((s) => s.startTime === startBooked)).toBe(false);
    expect(putSlots).toHaveLength(2);

    putReq.flush({
      slots: [
        { id: 'open-1', startTime: startOpen, endTime: endOpen, isBooked: false },
        { id: 'open-2', startTime: putSlots[1].startTime, endTime: putSlots[1].endTime, isBooked: false },
        { id: 'booked-1', startTime: startBooked, endTime: endBooked, isBooked: true },
      ],
    });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.textContent).toContain('Your availability has been saved successfully.');
  });

  it('converts local generator times to UTC ISO strings ending in Z', async () => {
    fixture.detectChanges();

    const getReq = http.expectOne(AVAILABILITY_URL);
    getReq.flush({ slots: [] });

    await fixture.whenStable();
    fixture.detectChanges();

    const targetDate = futureDateString(4);
    component.generatorForm.setValue({
      date: targetDate,
      startTime: '09:00',
      endTime: '09:30',
    });

    component['onGenerateSlots']();
    await fixture.whenStable();
    fixture.detectChanges();

    const saveBtn = page.querySelector<HTMLButtonElement>('.button-save')!;
    saveBtn.click();

    const putReq = http.expectOne(AVAILABILITY_URL);
    expect(putReq.request.method).toBe('PUT');

    const firstSlot = putReq.request.body.slots[0];
    expect(firstSlot.startTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(firstSlot.endTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    putReq.flush({ slots: [] });
  });

  it('validates time ranges before generating (end time before start time)', async () => {
    fixture.detectChanges();

    const getReq = http.expectOne(AVAILABILITY_URL);
    getReq.flush({ slots: [] });

    component.generatorForm.setValue({
      date: futureDateString(2),
      startTime: '11:00',
      endTime: '10:00',
    });

    component['onGenerateSlots']();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.textContent).toContain('End time must be after start time.');
  });

  it('validates against generating slots in the past', async () => {
    fixture.detectChanges();

    const getReq = http.expectOne(AVAILABILITY_URL);
    getReq.flush({ slots: [] });

    component.generatorForm.setValue({
      date: '2020-01-01',
      startTime: '09:00',
      endTime: '10:00',
    });

    component['onGenerateSlots']();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.textContent).toContain('Cannot create slots in the past.');
  });

  it('shows server error message as written on PUT rejection', async () => {
    fixture.detectChanges();

    const getReq = http.expectOne(AVAILABILITY_URL);
    getReq.flush({ slots: [] });

    component.generatorForm.setValue({
      date: futureDateString(2),
      startTime: '09:00',
      endTime: '09:30',
    });

    component['onGenerateSlots']();
    await fixture.whenStable();
    fixture.detectChanges();

    const saveBtn = page.querySelector<HTMLButtonElement>('.button-save')!;
    saveBtn.click();

    const putReq = http.expectOne(AVAILABILITY_URL);
    putReq.flush(
      {
        message: 'Cannot add or modify a slot that overlaps with an already booked slot',
        code: 'VALIDATION_ERROR',
      },
      { status: 400, statusText: 'Bad Request' },
    );

    await fixture.whenStable();
    fixture.detectChanges();

    const alert = page.querySelector('.alert-error')!;
    expect(alert).not.toBeNull();
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.textContent).toContain(
      'Cannot add or modify a slot that overlaps with an already booked slot',
    );
  });

  it('shows friendly message when server cannot be reached (status 0)', async () => {
    fixture.detectChanges();

    const getReq = http.expectOne(AVAILABILITY_URL);
    getReq.error(new ProgressEvent('error'));

    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.textContent).toContain('Cannot reach the server. Please try again.');
  });

  it('verifies route guard configuration for /doctor/availability', () => {
    const route = routes.find((r) => r.path === 'doctor/availability');
    expect(route).toBeDefined();
    expect(route?.title).toBe('Doctor availability | MediSync');
    expect(route?.canActivate).toBeDefined();
    expect(route?.canActivate?.length).toBeGreaterThan(0);
  });
});
