import '@angular/compiler';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  Prescription,
  PrescriptionListResponse,
} from '../../../core/prescriptions/prescription.models';
import { PrescriptionsService } from '../../../core/prescriptions/prescription.service';
import { PatientPrescriptions } from './patient-prescriptions';

const MOCK_EMPTY_RESPONSE: PrescriptionListResponse = {
  prescriptions: [],
  pagination: {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  },
};

const MOCK_PRESCRIPTIONS: Prescription[] = [
  {
    id: '507f1f77bcf86cd799439011',
    appointment: '507f191e810c19729de860ea',
    patient: { id: 'patient-1', name: 'Asha Sharma' },
    doctor: { id: 'doctor-1', name: 'Vikram Sen' },
    issuedDate: '2026-10-29',
    items: [
      {
        medicine: 'Amoxicillin 500mg',
        dosage: '1 capsule three times daily',
        instructions: 'Take after meals with plenty of water for 7 days.',
      },
      {
        medicine: 'Paracetamol 500mg',
        dosage: '1 tablet every 6 hours',
        instructions: 'Take as needed for fever or pain.',
      },
    ],
    pdfUrl: '/api/v1/prescriptions/507f1f77bcf86cd799439011/pdf',
    pdfStatus: 'ready',
    createdAt: '2026-10-29T10:00:00.000Z',
  },
  {
    id: '507f1f77bcf86cd799439012',
    appointment: '507f191e810c19729de860eb',
    patient: { id: 'patient-1', name: 'Asha Sharma' },
    doctor: { id: 'doctor-2', name: 'Anita Roy' },
    issuedDate: '2026-10-20',
    items: [
      {
        medicine: 'Cetirizine 10mg',
        dosage: '1 tablet once daily',
        instructions: 'Take before bedtime.',
      },
    ],
    pdfUrl: '/api/v1/prescriptions/507f1f77bcf86cd799439012/pdf',
    pdfStatus: 'pending',
    createdAt: '2026-10-20T08:30:00.000Z',
  },
];

const MOCK_PRESCRIPTIONS_RESPONSE: PrescriptionListResponse = {
  prescriptions: MOCK_PRESCRIPTIONS,
  pagination: {
    page: 1,
    limit: 2,
    total: 4,
    totalPages: 2,
  },
};

describe('PatientPrescriptions', () => {
  let fixture: ComponentFixture<PatientPrescriptions>;
  let component: PatientPrescriptions;
  let serviceMock: {
    getPrescriptions: ReturnType<typeof vi.fn>;
    downloadPrescriptionPdf: ReturnType<typeof vi.fn>;
    triggerBlobDownload: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    serviceMock = {
      getPrescriptions: vi.fn(),
      downloadPrescriptionPdf: vi.fn(),
      triggerBlobDownload: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [PatientPrescriptions],
      providers: [provideRouter([]), { provide: PrescriptionsService, useValue: serviceMock }],
    }).compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createComponent(): void {
    fixture = TestBed.createComponent(PatientPrescriptions);
    component = fixture.componentInstance;
  }

  it('loads and displays prescriptions on initialization', () => {
    serviceMock.getPrescriptions.mockReturnValue(of(MOCK_PRESCRIPTIONS_RESPONSE));
    createComponent();
    fixture.detectChanges();

    expect(serviceMock.getPrescriptions).toHaveBeenCalledWith({ page: 1, limit: 10 });
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('.state-box')).toBeNull();
    expect(compiled.querySelectorAll('.prescription-card').length).toBe(2);
    expect(compiled.textContent).toContain('Dr. Vikram Sen');
    expect(compiled.textContent).toContain('Amoxicillin 500mg');
    expect(compiled.textContent).toContain('1 capsule three times daily');
    expect(compiled.textContent).toContain('Take after meals with plenty of water for 7 days.');
    expect(compiled.textContent).toContain('PDF pending');
  });

  it('displays empty state when patient has no prescriptions', () => {
    serviceMock.getPrescriptions.mockReturnValue(of(MOCK_EMPTY_RESPONSE));
    createComponent();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.empty-box')).not.toBeNull();
    expect(compiled.textContent).toContain('No prescriptions yet');
  });

  it('displays error state when loading prescriptions fails and retries on button click', () => {
    serviceMock.getPrescriptions.mockReturnValue(
      throwError(() => ({ status: 500, error: { message: 'Database connection failed' } })),
    );
    createComponent();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.error-box')).not.toBeNull();
    expect(compiled.textContent).toContain('Database connection failed');

    // Test retry
    serviceMock.getPrescriptions.mockReturnValue(of(MOCK_PRESCRIPTIONS_RESPONSE));
    const retryBtn = compiled.querySelector('.error-box button') as HTMLButtonElement;
    retryBtn.click();
    fixture.detectChanges();

    expect(compiled.querySelectorAll('.prescription-card').length).toBe(2);
  });

  it('triggers PDF download and calls triggerBlobDownload on Download PDF click', () => {
    const mockBlob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    serviceMock.getPrescriptions.mockReturnValue(of(MOCK_PRESCRIPTIONS_RESPONSE));
    serviceMock.downloadPrescriptionPdf.mockReturnValue(of(mockBlob));

    createComponent();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const downloadBtns = compiled.querySelectorAll('.button-download');
    const firstBtn = downloadBtns[0] as HTMLButtonElement;
    firstBtn.click();
    fixture.detectChanges();

    expect(serviceMock.downloadPrescriptionPdf).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
    expect(serviceMock.triggerBlobDownload).toHaveBeenCalledWith(
      mockBlob,
      'prescription_507f1f77bcf86cd799439011.pdf',
    );
  });

  it('displays error message when PDF download fails with 502', () => {
    serviceMock.getPrescriptions.mockReturnValue(of(MOCK_PRESCRIPTIONS_RESPONSE));
    serviceMock.downloadPrescriptionPdf.mockReturnValue(
      throwError(() => ({ status: 502, error: { message: 'PDF Service Unavailable' } })),
    );

    createComponent();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const downloadBtns = compiled.querySelectorAll('.button-download');
    (downloadBtns[0] as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(compiled.textContent).toContain(
      'Prescription saved, but PDF generation is currently unavailable. You can retry downloading it.',
    );
  });

  it('handles pagination next and previous page changes', () => {
    serviceMock.getPrescriptions.mockReturnValue(of(MOCK_PRESCRIPTIONS_RESPONSE));
    createComponent();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const nextBtn = compiled.querySelector('button[aria-label="Next page"]') as HTMLButtonElement;
    expect(nextBtn).not.toBeNull();

    nextBtn.click();
    fixture.detectChanges();

    expect(serviceMock.getPrescriptions).toHaveBeenCalledWith({ page: 2, limit: 10 });
  });

  it('clears in-memory prescriptions on destroy for medical privacy', () => {
    serviceMock.getPrescriptions.mockReturnValue(of(MOCK_PRESCRIPTIONS_RESPONSE));
    createComponent();
    fixture.detectChanges();

    expect(component['prescriptions']().length).toBe(2);

    fixture.destroy();
    expect(component['prescriptions']().length).toBe(0);
  });
});
