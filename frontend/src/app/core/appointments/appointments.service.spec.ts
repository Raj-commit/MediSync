import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import {
  AppointmentActionRequest,
  AppointmentListResponse,
  BookAppointmentRequest,
  BookAppointmentResponse,
  DoctorAvailabilityResponse,
  DoctorSearchResponse,
  ManageAppointmentResponse,
} from './appointments.models';
import { AppointmentsService } from './appointments.service';

const DOCTORS_URL = `${environment.apiUrl}/doctors`;
const APPOINTMENTS_URL = `${environment.apiUrl}/appointments`;

describe('AppointmentsService', () => {
  let service: AppointmentsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(AppointmentsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  describe('searchDoctors', () => {
    it('sends GET to /doctors with no query params when params are omitted', () => {
      const mockResponse: DoctorSearchResponse = {
        doctors: [
          {
            id: 'doc-1',
            name: 'Dr. Sarah Connor',
            specialisations: ['Cardiology'],
            qualification: 'MBBS, MD',
          },
        ],
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
        },
      };

      let actual: DoctorSearchResponse | undefined;
      service.searchDoctors().subscribe((res) => {
        actual = res;
      });

      const req = http.expectOne(DOCTORS_URL);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.keys().length).toBe(0);
      req.flush(mockResponse);

      expect(actual).toEqual(mockResponse);
    });

    it('sends only non-empty allowed query parameters (name, specialisation, page, limit)', () => {
      service
        .searchDoctors({
          name: 'Sarah',
          specialisation: 'Cardio',
          page: 2,
          limit: 20,
        })
        .subscribe();

      const req = http.expectOne(
        (request) =>
          request.url === DOCTORS_URL &&
          request.params.get('name') === 'Sarah' &&
          request.params.get('specialisation') === 'Cardio' &&
          request.params.get('page') === '2' &&
          request.params.get('limit') === '20',
      );
      expect(req.request.method).toBe('GET');
      req.flush({ doctors: [], pagination: { page: 2, limit: 20, total: 0, totalPages: 0 } });
    });

    it('omits empty strings and invalid page/limit from query parameters', () => {
      service
        .searchDoctors({
          name: '   ',
          specialisation: '',
          page: 0,
          limit: -5,
        })
        .subscribe();

      const req = http.expectOne(DOCTORS_URL);
      expect(req.request.params.keys().length).toBe(0);
      req.flush({ doctors: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } });
    });
  });

  describe('getDoctorAvailability', () => {
    it('fetches open availability slots for a doctor by ID', () => {
      const doctorId = 'doc-123';
      const mockResponse: DoctorAvailabilityResponse = {
        doctor: { id: doctorId, name: 'Dr. John Watson' },
        slots: [
          {
            id: 'slot-1',
            startTime: '2026-11-01T09:00:00.000Z',
            endTime: '2026-11-01T09:30:00.000Z',
            isBooked: false,
          },
        ],
      };

      let actual: DoctorAvailabilityResponse | undefined;
      service.getDoctorAvailability(doctorId).subscribe((res) => {
        actual = res;
      });

      const req = http.expectOne(`${DOCTORS_URL}/${doctorId}/availability`);
      expect(req.request.method).toBe('GET');
      req.flush(mockResponse);

      expect(actual).toEqual(mockResponse);
    });
  });

  describe('bookAppointment', () => {
    it('sends POST to /appointments with { doctorId, slotId } and returns 201 response', () => {
      const payload: BookAppointmentRequest = {
        doctorId: 'doc-123',
        slotId: 'slot-456',
      };

      const mockResponse: BookAppointmentResponse = {
        appointment: {
          id: 'appt-789',
          doctor: { id: 'doc-123', name: 'Dr. John Watson' },
          dateTime: '2026-11-01T09:00:00.000Z',
          endTime: '2026-11-01T09:30:00.000Z',
          status: 'requested',
        },
      };

      let actual: BookAppointmentResponse | undefined;
      service.bookAppointment(payload).subscribe((res) => {
        actual = res;
      });

      const req = http.expectOne(APPOINTMENTS_URL);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(payload);
      req.flush(mockResponse, { status: 201, statusText: 'Created' });

      expect(actual).toEqual(mockResponse);
    });

    it('propagates 409 SLOT_TAKEN errors when the slot is already taken', () => {
      const payload: BookAppointmentRequest = {
        doctorId: 'doc-123',
        slotId: 'slot-taken',
      };

      let errorStatus: number | undefined;
      let errorCode: string | undefined;

      service.bookAppointment(payload).subscribe({
        next: () => {
          throw new Error('should have failed with 409');
        },
        error: (err) => {
          errorStatus = err.status;
          errorCode = err.error?.code;
        },
      });

      const req = http.expectOne(APPOINTMENTS_URL);
      req.flush(
        { message: 'This slot is already booked', code: 'SLOT_TAKEN' },
        { status: 409, statusText: 'Conflict' },
      );

      expect(errorStatus).toBe(409);
      expect(errorCode).toBe('SLOT_TAKEN');
    });
  });

  describe('getAppointments', () => {
    it('sends GET to /appointments with no query params when params are omitted', () => {
      const mockResponse: AppointmentListResponse = {
        appointments: [
          {
            id: 'appt-1',
            doctor: { id: 'doc-1', name: 'Dr. Sarah Connor' },
            dateTime: '2026-11-01T10:00:00.000Z',
            endTime: '2026-11-01T10:30:00.000Z',
            status: 'confirmed',
          },
        ],
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
        },
      };

      let actual: AppointmentListResponse | undefined;
      service.getAppointments().subscribe((res) => {
        actual = res;
      });

      const req = http.expectOne(APPOINTMENTS_URL);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.keys().length).toBe(0);
      req.flush(mockResponse);

      expect(actual).toEqual(mockResponse);
    });

    it('sends valid status, when, page, and limit query parameters', () => {
      service
        .getAppointments({
          status: 'confirmed',
          when: 'upcoming',
          page: 2,
          limit: 15,
        })
        .subscribe();

      const req = http.expectOne(
        (request) =>
          request.url === APPOINTMENTS_URL &&
          request.params.get('status') === 'confirmed' &&
          request.params.get('when') === 'upcoming' &&
          request.params.get('page') === '2' &&
          request.params.get('limit') === '15',
      );
      expect(req.request.method).toBe('GET');
      req.flush({ appointments: [], pagination: { page: 2, limit: 15, total: 0, totalPages: 0 } });
    });

    it('omits undefined or non-positive page and limit parameters', () => {
      service
        .getAppointments({
          when: 'past',
          page: 0,
          limit: -1,
        })
        .subscribe();

      const req = http.expectOne(
        (request) =>
          request.url === APPOINTMENTS_URL &&
          request.params.get('when') === 'past' &&
          !request.params.has('page') &&
          !request.params.has('limit'),
      );
      expect(req.request.method).toBe('GET');
      req.flush({ appointments: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } });
    });
  });

  describe('manageAppointment', () => {
    it('sends PATCH to /appointments/:id with action cancel', () => {
      const payload: AppointmentActionRequest = { action: 'cancel' };
      const appointmentId = 'appt-123';
      const mockResponse: ManageAppointmentResponse = {
        appointment: {
          id: appointmentId,
          doctor: { id: 'doc-1', name: 'Dr. Sarah Connor' },
          dateTime: '2026-11-01T10:00:00.000Z',
          endTime: '2026-11-01T10:30:00.000Z',
          status: 'cancelled',
        },
      };

      let actual: ManageAppointmentResponse | undefined;
      service.manageAppointment(appointmentId, payload).subscribe((res) => {
        actual = res;
      });

      const req = http.expectOne(`${APPOINTMENTS_URL}/${appointmentId}`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual(payload);
      req.flush(mockResponse);

      expect(actual).toEqual(mockResponse);
    });

    it('sends PATCH to /appointments/:id with action reschedule and slotId', () => {
      const payload: AppointmentActionRequest = {
        action: 'reschedule',
        slotId: 'slot-999',
      };
      const appointmentId = 'appt-123';
      const mockResponse: ManageAppointmentResponse = {
        appointment: {
          id: appointmentId,
          doctor: { id: 'doc-1', name: 'Dr. Sarah Connor' },
          dateTime: '2026-11-02T10:00:00.000Z',
          endTime: '2026-11-02T10:30:00.000Z',
          status: 'requested',
        },
      };

      let actual: ManageAppointmentResponse | undefined;
      service.manageAppointment(appointmentId, payload).subscribe((res) => {
        actual = res;
      });

      const req = http.expectOne(`${APPOINTMENTS_URL}/${appointmentId}`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual(payload);
      req.flush(mockResponse);

      expect(actual).toEqual(mockResponse);
    });

    it('sends PATCH to /appointments/:id with action accept', () => {
      const payload: AppointmentActionRequest = { action: 'accept' };
      const appointmentId = 'appt-456';
      const mockResponse: ManageAppointmentResponse = {
        appointment: {
          id: appointmentId,
          patient: { id: 'pat-1', name: 'John Doe' },
          dateTime: '2026-11-01T10:00:00.000Z',
          endTime: '2026-11-01T10:30:00.000Z',
          status: 'confirmed',
        },
      };

      let actual: ManageAppointmentResponse | undefined;
      service.manageAppointment(appointmentId, payload).subscribe((res) => {
        actual = res;
      });

      const req = http.expectOne(`${APPOINTMENTS_URL}/${appointmentId}`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual(payload);
      req.flush(mockResponse);

      expect(actual).toEqual(mockResponse);
    });

    it('sends PATCH to /appointments/:id with action reject', () => {
      const payload: AppointmentActionRequest = { action: 'reject' };
      const appointmentId = 'appt-456';
      const mockResponse: ManageAppointmentResponse = {
        appointment: {
          id: appointmentId,
          patient: { id: 'pat-1', name: 'John Doe' },
          dateTime: '2026-11-01T10:00:00.000Z',
          endTime: '2026-11-01T10:30:00.000Z',
          status: 'cancelled',
        },
      };

      let actual: ManageAppointmentResponse | undefined;
      service.manageAppointment(appointmentId, payload).subscribe((res) => {
        actual = res;
      });

      const req = http.expectOne(`${APPOINTMENTS_URL}/${appointmentId}`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual(payload);
      req.flush(mockResponse);

      expect(actual).toEqual(mockResponse);
    });

    it('sends PATCH to /appointments/:id with action complete', () => {
      const payload: AppointmentActionRequest = { action: 'complete' };
      const appointmentId = 'appt-456';
      const mockResponse: ManageAppointmentResponse = {
        appointment: {
          id: appointmentId,
          patient: { id: 'pat-1', name: 'John Doe' },
          dateTime: '2026-10-25T10:00:00.000Z',
          endTime: '2026-10-25T10:30:00.000Z',
          status: 'completed',
        },
      };

      let actual: ManageAppointmentResponse | undefined;
      service.manageAppointment(appointmentId, payload).subscribe((res) => {
        actual = res;
      });

      const req = http.expectOne(`${APPOINTMENTS_URL}/${appointmentId}`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual(payload);
      req.flush(mockResponse);

      expect(actual).toEqual(mockResponse);
    });

    it('propagates error when manageAppointment fails', () => {
      const payload: AppointmentActionRequest = {
        action: 'reschedule',
        slotId: 'taken-slot',
      };
      const appointmentId = 'appt-123';

      let errorStatus: number | undefined;
      let errorCode: string | undefined;

      service.manageAppointment(appointmentId, payload).subscribe({
        next: () => {
          throw new Error('should have failed with 409');
        },
        error: (err) => {
          errorStatus = err.status;
          errorCode = err.error?.code;
        },
      });

      const req = http.expectOne(`${APPOINTMENTS_URL}/${appointmentId}`);
      req.flush(
        { message: 'This slot is already booked', code: 'SLOT_TAKEN' },
        { status: 409, statusText: 'Conflict' },
      );

      expect(errorStatus).toBe(409);
      expect(errorCode).toBe('SLOT_TAKEN');
    });
  });
});
