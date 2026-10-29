import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../../environments/environment';
import {
  AddRecordEntryRequest,
  AddRecordEntryResponse,
  MedicalRecordResponse,
} from './records.models';
import { RecordsService } from './records.service';

const BASE_RECORDS_URL = `${environment.apiUrl}/records`;
const VALID_PATIENT_ID = '507f1f77bcf86cd799439011';
const INVALID_PATIENT_ID = 'invalid-id-123';

const MOCK_RECORD_RESPONSE: MedicalRecordResponse = {
  record: {
    patient: {
      id: VALID_PATIENT_ID,
      name: 'Asha Sharma',
      age: 28,
    },
    entries: [
      {
        id: 'entry-1',
        diagnosis: 'Hypertension Stage 1',
        notes: 'Advised lifestyle modification and reduced salt intake.',
        updatedAt: '2026-10-29T10:00:00.000Z',
        updatedBy: {
          id: '507f191e810c19729de860ea',
          name: 'Dr. Vikram Sen',
        },
      },
    ],
    pagination: {
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
    },
  },
};

const MOCK_ADD_ENTRY_RESPONSE: AddRecordEntryResponse = {
  entry: {
    id: 'entry-2',
    diagnosis: 'Type 2 Diabetes',
    notes: 'Prescribed Metformin 500mg daily.',
    updatedAt: '2026-10-29T11:00:00.000Z',
    updatedBy: {
      id: '507f191e810c19729de860ea',
      name: 'Dr. Vikram Sen',
    },
  },
};

describe('RecordsService', () => {
  let service: RecordsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(RecordsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  describe('isValidPatientId', () => {
    it('returns true for valid 24-character hex MongoDB ObjectIds', () => {
      expect(service.isValidPatientId(VALID_PATIENT_ID)).toBe(true);
      expect(service.isValidPatientId('0123456789abcdef01234567')).toBe(true);
      expect(service.isValidPatientId('ABCDEF0123456789ABCDEF01')).toBe(true);
    });

    it('returns false for invalid IDs', () => {
      expect(service.isValidPatientId(INVALID_PATIENT_ID)).toBe(false);
      expect(service.isValidPatientId('')).toBe(false);
      expect(service.isValidPatientId('   ')).toBe(false);
      expect(service.isValidPatientId('507f1f77bcf86cd79943901')).toBe(false); // 23 chars
      expect(service.isValidPatientId('507f1f77bcf86cd7994390111')).toBe(false); // 25 chars
      expect(service.isValidPatientId('507f1f77bcf86cd79943901z')).toBe(false); // non-hex
      expect(service.isValidPatientId(null as unknown as string)).toBe(false);
      expect(service.isValidPatientId(undefined as unknown as string)).toBe(false);
    });
  });

  describe('getOwnRecord', () => {
    it('sends GET to /records/me with no query params when omitted', () => {
      let result: MedicalRecordResponse | undefined;

      service.getOwnRecord().subscribe((res) => {
        result = res;
      });

      const req = http.expectOne(`${BASE_RECORDS_URL}/me`);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.keys().length).toBe(0);

      req.flush(MOCK_RECORD_RESPONSE);
      expect(result).toEqual(MOCK_RECORD_RESPONSE);
    });

    it('sends valid page and limit query parameters', () => {
      service.getOwnRecord({ page: 2, limit: 5 }).subscribe();

      const req = http.expectOne(
        (r) =>
          r.url === `${BASE_RECORDS_URL}/me` &&
          r.params.get('page') === '2' &&
          r.params.get('limit') === '5',
      );
      expect(req.request.method).toBe('GET');
      req.flush(MOCK_RECORD_RESPONSE);
    });

    it('omits non-positive or undefined page and limit query parameters', () => {
      service.getOwnRecord({ page: 0, limit: -5 }).subscribe();

      const req = http.expectOne(`${BASE_RECORDS_URL}/me`);
      expect(req.request.params.keys().length).toBe(0);
      req.flush(MOCK_RECORD_RESPONSE);
    });

    it('propagates error when GET /records/me fails', () => {
      let errorStatus = 0;

      service.getOwnRecord().subscribe({
        next: () => expect.unreachable('Should have failed'),
        error: (err) => {
          errorStatus = err.status;
        },
      });

      const req = http.expectOne(`${BASE_RECORDS_URL}/me`);
      req.flush({ message: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401, statusText: 'Unauthorized' });

      expect(errorStatus).toBe(401);
    });
  });

  describe('getPatientRecord', () => {
    it('sends GET to /records/patient/:patientId for a valid patientId', () => {
      let result: MedicalRecordResponse | undefined;

      service.getPatientRecord(VALID_PATIENT_ID, { page: 1, limit: 10 }).subscribe((res) => {
        result = res;
      });

      const req = http.expectOne(
        (r) =>
          r.url === `${BASE_RECORDS_URL}/patient/${VALID_PATIENT_ID}` &&
          r.params.get('page') === '1' &&
          r.params.get('limit') === '10',
      );
      expect(req.request.method).toBe('GET');

      req.flush(MOCK_RECORD_RESPONSE);
      expect(result).toEqual(MOCK_RECORD_RESPONSE);
    });

    it('rejects without making an HTTP request if patientId is invalid', () => {
      let caughtError: Error | undefined;

      service.getPatientRecord(INVALID_PATIENT_ID).subscribe({
        next: () => expect.unreachable('Should have failed'),
        error: (err) => {
          caughtError = err;
        },
      });

      http.expectNone(`${BASE_RECORDS_URL}/patient/${INVALID_PATIENT_ID}`);
      expect(caughtError?.message).toBe('Invalid patient ID format');
    });

    it('propagates 404 NOT_FOUND error when patient record is not accessible', () => {
      let errorCode = '';

      service.getPatientRecord(VALID_PATIENT_ID).subscribe({
        next: () => expect.unreachable('Should have failed'),
        error: (err) => {
          errorCode = err.error.code;
        },
      });

      const req = http.expectOne(`${BASE_RECORDS_URL}/patient/${VALID_PATIENT_ID}`);
      req.flush(
        { message: 'Patient not found', code: 'NOT_FOUND' },
        { status: 404, statusText: 'Not Found' },
      );

      expect(errorCode).toBe('NOT_FOUND');
    });

    it('propagates 403 FORBIDDEN when user role is not authorized', () => {
      let status = 0;

      service.getPatientRecord(VALID_PATIENT_ID).subscribe({
        next: () => expect.unreachable('Should have failed'),
        error: (err) => {
          status = err.status;
        },
      });

      const req = http.expectOne(`${BASE_RECORDS_URL}/patient/${VALID_PATIENT_ID}`);
      req.flush(
        { message: 'Forbidden', code: 'FORBIDDEN' },
        { status: 403, statusText: 'Forbidden' },
      );

      expect(status).toBe(403);
    });
  });

  describe('addEntry', () => {
    const payload: AddRecordEntryRequest = {
      diagnosis: '  Type 2 Diabetes  ',
      notes: '  Prescribed Metformin 500mg daily.  ',
    };

    it('sends POST to /records/patient/:patientId/entries with trimmed body', () => {
      let result: AddRecordEntryResponse | undefined;

      service.addEntry(VALID_PATIENT_ID, payload).subscribe((res) => {
        result = res;
      });

      const req = http.expectOne(`${BASE_RECORDS_URL}/patient/${VALID_PATIENT_ID}/entries`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        diagnosis: 'Type 2 Diabetes',
        notes: 'Prescribed Metformin 500mg daily.',
      });

      req.flush(MOCK_ADD_ENTRY_RESPONSE, { status: 201, statusText: 'Created' });
      expect(result).toEqual(MOCK_ADD_ENTRY_RESPONSE);
    });

    it('rejects without making an HTTP request if patientId is invalid', () => {
      let caughtError: Error | undefined;

      service.addEntry('not-a-valid-id', payload).subscribe({
        next: () => expect.unreachable('Should have failed'),
        error: (err) => {
          caughtError = err;
        },
      });

      http.expectNone(`${BASE_RECORDS_URL}/patient/not-a-valid-id/entries`);
      expect(caughtError?.message).toBe('Invalid patient ID format');
    });

    it('propagates validation errors from backend (400 VALIDATION_ERROR)', () => {
      let status = 0;
      let message = '';

      service.addEntry(VALID_PATIENT_ID, { diagnosis: '', notes: '' }).subscribe({
        next: () => expect.unreachable('Should have failed'),
        error: (err) => {
          status = err.status;
          message = err.error.message;
        },
      });

      const req = http.expectOne(`${BASE_RECORDS_URL}/patient/${VALID_PATIENT_ID}/entries`);
      req.flush(
        { message: 'diagnosis must be a non-empty string', code: 'VALIDATION_ERROR' },
        { status: 400, statusText: 'Bad Request' },
      );

      expect(status).toBe(400);
      expect(message).toBe('diagnosis must be a non-empty string');
    });
  });

  describe('clear', () => {
    it('executes without error', () => {
      expect(() => service.clear()).not.toThrow();
    });
  });
});
