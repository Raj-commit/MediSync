import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { environment } from '../../../environments/environment';
import {
  CreatePrescriptionPayload,
  CreatePrescriptionResponse,
  PrescriptionListResponse,
} from './prescription.models';
import { PrescriptionsService } from './prescription.service';

const BASE_URL = `${environment.apiUrl}/prescriptions`;
const VALID_PRESCRIPTION_ID = '507f1f77bcf86cd799439011';
const VALID_APPOINTMENT_ID = '507f191e810c19729de860ea';

const MOCK_PRESCRIPTION_LIST: PrescriptionListResponse = {
  prescriptions: [
    {
      id: VALID_PRESCRIPTION_ID,
      appointment: VALID_APPOINTMENT_ID,
      patient: { id: 'patient-1', name: 'John Doe' },
      doctor: { id: 'doctor-1', name: 'Dr. Jane Smith' },
      issuedDate: '2026-10-29',
      items: [
        {
          medicine: 'Amoxicillin 500mg',
          dosage: '1 capsule three times daily',
          instructions: 'Take after meals for 7 days',
        },
      ],
      pdfUrl: `/api/v1/prescriptions/${VALID_PRESCRIPTION_ID}/pdf`,
      pdfStatus: 'ready',
      createdAt: '2026-10-29T10:00:00.000Z',
    },
  ],
  pagination: {
    page: 1,
    limit: 10,
    total: 1,
    totalPages: 1,
  },
};

describe('PrescriptionsService', () => {
  let service: PrescriptionsService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PrescriptionsService, provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(PrescriptionsService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    vi.restoreAllMocks();
  });

  describe('isValidObjectId', () => {
    it('returns true for 24-character hex strings', () => {
      expect(service.isValidObjectId('507f1f77bcf86cd799439011')).toBe(true);
      expect(service.isValidObjectId('ABCDEF0123456789abcdef01')).toBe(true);
    });

    it('returns false for non-hex or wrong-length strings', () => {
      expect(service.isValidObjectId('')).toBe(false);
      expect(service.isValidObjectId('short-id')).toBe(false);
      expect(service.isValidObjectId('507f1f77bcf86cd79943901z')).toBe(false);
      expect(service.isValidObjectId(null)).toBe(false);
      expect(service.isValidObjectId(undefined)).toBe(false);
    });
  });

  describe('getPrescriptions', () => {
    it('sends GET request to baseUrl with no params when none provided', () => {
      service.getPrescriptions().subscribe((res) => {
        expect(res).toEqual(MOCK_PRESCRIPTION_LIST);
      });

      const req = httpTesting.expectOne(BASE_URL);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.keys().length).toBe(0);
      req.flush(MOCK_PRESCRIPTION_LIST);
    });

    it('appends query parameters when pagination and appointmentId are provided', () => {
      service
        .getPrescriptions({ page: 2, limit: 20, appointmentId: VALID_APPOINTMENT_ID })
        .subscribe((res) => {
          expect(res).toEqual(MOCK_PRESCRIPTION_LIST);
        });

      const req = httpTesting.expectOne((r) => r.url === BASE_URL);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('page')).toBe('2');
      expect(req.request.params.get('limit')).toBe('20');
      expect(req.request.params.get('appointmentId')).toBe(VALID_APPOINTMENT_ID);
      req.flush(MOCK_PRESCRIPTION_LIST);
    });
  });

  describe('createPrescription', () => {
    it('sends POST request with appointmentId and items payload', () => {
      const payload: CreatePrescriptionPayload = {
        appointmentId: VALID_APPOINTMENT_ID,
        items: [
          {
            medicine: 'Paracetamol 500mg',
            dosage: '1 tablet twice daily',
            instructions: 'Take when fever exceeds 38C',
          },
        ],
      };

      const mockResponse: CreatePrescriptionResponse = {
        prescription: MOCK_PRESCRIPTION_LIST.prescriptions[0],
      };

      service.createPrescription(payload).subscribe((res) => {
        expect(res).toEqual(mockResponse);
      });

      const req = httpTesting.expectOne(BASE_URL);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(payload);
      req.flush(mockResponse);
    });
  });

  describe('downloadPrescriptionPdf', () => {
    it('sends GET request for raw PDF bytes with responseType blob', () => {
      const mockPdfBlob = new Blob(['%PDF-1.4 mock content'], { type: 'application/pdf' });

      service.downloadPrescriptionPdf(VALID_PRESCRIPTION_ID).subscribe((blob) => {
        expect(blob).toEqual(mockPdfBlob);
        expect(blob.type).toBe('application/pdf');
      });

      const req = httpTesting.expectOne(`${BASE_URL}/${VALID_PRESCRIPTION_ID}/pdf`);
      expect(req.request.method).toBe('GET');
      expect(req.request.responseType).toBe('blob');
      req.flush(mockPdfBlob);
    });

    it('returns error without sending HTTP request if ID is invalid', () => {
      service.downloadPrescriptionPdf('invalid-id').subscribe({
        next: () => expect.unreachable('Should have errored'),
        error: (err: Error) => {
          expect(err.message).toBe('Invalid prescription ID format');
        },
      });

      httpTesting.expectNone(`${BASE_URL}/invalid-id/pdf`);
    });
  });

  describe('triggerBlobDownload', () => {
    it('creates object URL, appends anchor, clicks it, and revokes URL in finally', () => {
      const mockBlob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
      const createObjectURLSpy = vi
        .spyOn(window.URL, 'createObjectURL')
        .mockReturnValue('blob:mock-pdf-url');
      const revokeObjectURLSpy = vi
        .spyOn(window.URL, 'revokeObjectURL')
        .mockImplementation(() => {});

      let clicked = false;
      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        const element = originalCreateElement(tagName);
        if (tagName === 'a') {
          vi.spyOn(element, 'click').mockImplementation(() => {
            clicked = true;
          });
        }
        return element;
      });

      service.triggerBlobDownload(mockBlob, 'test_prescription.pdf');

      expect(createObjectURLSpy).toHaveBeenCalledWith(mockBlob);
      expect(clicked).toBe(true);
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-pdf-url');
    });

    it('throws error when blob type is not application/pdf', () => {
      const badBlob = new Blob(['plain text'], { type: 'text/plain' });
      expect(() => service.triggerBlobDownload(badBlob, 'file.pdf')).toThrow(
        'Invalid file format received: expected application/pdf',
      );
    });
  });
});
