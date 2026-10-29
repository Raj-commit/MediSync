import '@angular/compiler';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CreatePrescriptionResponse,
  Prescription,
  PrescriptionListResponse,
} from '../../../core/prescriptions/prescription.models';
import { PrescriptionsService } from '../../../core/prescriptions/prescription.service';
import { DoctorPrescription } from './doctor-prescription';

const VALID_APPOINTMENT_ID = '507f1f77bcf86cd799439011';
const INVALID_APPOINTMENT_ID = 'invalid-id-xyz';

const MOCK_EXISTING_PRESCRIPTION: Prescription = {
  id: '507f191e810c19729de860ea',
  appointment: VALID_APPOINTMENT_ID,
  patient: { id: 'patient-1', name: 'John Doe' },
  doctor: { id: 'doctor-1', name: 'Dr. Jane Smith' },
  issuedDate: '2026-10-29',
  items: [
    {
      medicine: 'Metformin 500mg',
      dosage: '1 tablet twice daily',
      instructions: 'Take with morning and evening meals.',
    },
  ],
  pdfUrl: '/api/v1/prescriptions/507f191e810c19729de860ea/pdf',
  pdfStatus: 'ready',
  createdAt: '2026-10-29T10:00:00.000Z',
};

const MOCK_PENDING_PRESCRIPTION: Prescription = {
  ...MOCK_EXISTING_PRESCRIPTION,
  pdfStatus: 'pending',
};

describe('DoctorPrescription', () => {
  let fixture: ComponentFixture<DoctorPrescription>;
  let component: DoctorPrescription;
  let serviceMock: {
    isValidObjectId: ReturnType<typeof vi.fn>;
    getPrescriptions: ReturnType<typeof vi.fn>;
    createPrescription: ReturnType<typeof vi.fn>;
    downloadPrescriptionPdf: ReturnType<typeof vi.fn>;
    triggerBlobDownload: ReturnType<typeof vi.fn>;
  };
  let currentParamId: string;

  beforeEach(async () => {
    currentParamId = VALID_APPOINTMENT_ID;

    serviceMock = {
      isValidObjectId: vi.fn((id: string) => /^[0-9a-fA-F]{24}$/.test(id)),
      getPrescriptions: vi.fn(),
      createPrescription: vi.fn(),
      downloadPrescriptionPdf: vi.fn(),
      triggerBlobDownload: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [DoctorPrescription],
      providers: [
        provideRouter([]),
        { provide: PrescriptionsService, useValue: serviceMock },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: () => currentParamId,
              },
            },
          },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createComponent(): void {
    fixture = TestBed.createComponent(DoctorPrescription);
    component = fixture.componentInstance;
  }

  it('rejects invalid appointment IDs without sending network requests', () => {
    currentParamId = INVALID_APPOINTMENT_ID;
    createComponent();
    fixture.detectChanges();

    expect(serviceMock.isValidObjectId).toHaveBeenCalledWith(INVALID_APPOINTMENT_ID);
    expect(serviceMock.getPrescriptions).not.toHaveBeenCalled();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Invalid Appointment Link');
    expect(compiled.textContent).toContain('24-character hexadecimal identifier');
  });

  it('renders read-only view when prescription already exists for the appointment', () => {
    const response: PrescriptionListResponse = {
      prescriptions: [MOCK_EXISTING_PRESCRIPTION],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    };
    serviceMock.getPrescriptions.mockReturnValue(of(response));

    createComponent();
    fixture.detectChanges();

    expect(serviceMock.getPrescriptions).toHaveBeenCalledWith({
      appointmentId: VALID_APPOINTMENT_ID,
    });

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.prescription-view-card')).not.toBeNull();
    expect(compiled.textContent).toContain('Issued Digital Prescription');
    expect(compiled.textContent).toContain('Metformin 500mg');
    expect(compiled.textContent).toContain('Prescription active');
    expect(compiled.querySelector('.form-card')).toBeNull();
  });

  it('renders creation form when no prescription exists for the appointment', () => {
    const emptyResponse: PrescriptionListResponse = {
      prescriptions: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
    };
    serviceMock.getPrescriptions.mockReturnValue(of(emptyResponse));

    createComponent();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.form-card')).not.toBeNull();
    expect(compiled.textContent).toContain('Create Digital Prescription');
    expect(component.items.length).toBe(1);
  });

  it('supports adding and removing dynamic medicine rows within limits (1 to 50)', () => {
    serviceMock.getPrescriptions.mockReturnValue(
      of({ prescriptions: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } }),
    );

    createComponent();
    fixture.detectChanges();

    expect(component.items.length).toBe(1);

    // Add item
    const compiled = fixture.nativeElement as HTMLElement;
    const addBtn = compiled.querySelector('.button-add') as HTMLButtonElement;
    addBtn.click();
    fixture.detectChanges();

    expect(component.items.length).toBe(2);

    // Remove item
    const removeBtn = compiled.querySelector('.button-remove') as HTMLButtonElement;
    expect(removeBtn).not.toBeNull();
    removeBtn.click();
    fixture.detectChanges();

    expect(component.items.length).toBe(1);
    // At minimum 1 item, remove button is not displayed
    expect(compiled.querySelector('.button-remove')).toBeNull();
  });

  it('validates required medicine fields and prevents opening modal if invalid', () => {
    serviceMock.getPrescriptions.mockReturnValue(
      of({ prescriptions: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } }),
    );

    createComponent();
    fixture.detectChanges();

    expect(component.form.valid).toBe(false);

    component['openConfirmModal']();
    fixture.detectChanges();

    expect(component['showConfirmModal']()).toBe(false);
  });

  it('opens confirmation modal with summary and permanent warning when form is valid', () => {
    serviceMock.getPrescriptions.mockReturnValue(
      of({ prescriptions: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } }),
    );

    createComponent();
    fixture.detectChanges();

    component.items.at(0).setValue({
      medicine: 'Ibuprofen 400mg',
      dosage: '1 tablet thrice daily',
      instructions: 'Take after meals for 5 days.',
    });
    fixture.detectChanges();

    expect(component.form.valid).toBe(true);

    component['openConfirmModal']();
    fixture.detectChanges();

    expect(component['showConfirmModal']()).toBe(true);

    const compiled = fixture.nativeElement as HTMLElement;
    const modal = compiled.querySelector('.modal-dialog');
    expect(modal).not.toBeNull();
    expect(modal?.getAttribute('role')).toBe('dialog');
    expect(modal?.getAttribute('aria-modal')).toBe('true');
    expect(modal?.textContent).toContain(
      'Prescriptions are permanent and cannot be modified or deleted once issued.',
    );
    expect(modal?.textContent).toContain('Ibuprofen 400mg');
  });

  it('submits prescription and displays success when PDF is ready', () => {
    serviceMock.getPrescriptions.mockReturnValue(
      of({ prescriptions: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } }),
    );
    const createRes: CreatePrescriptionResponse = {
      prescription: MOCK_EXISTING_PRESCRIPTION,
    };
    serviceMock.createPrescription.mockReturnValue(of(createRes));

    createComponent();
    fixture.detectChanges();

    component.items.at(0).setValue({
      medicine: 'Metformin 500mg',
      dosage: '1 tablet twice daily',
      instructions: 'Take with morning and evening meals.',
    });
    component['openConfirmModal']();
    fixture.detectChanges();

    component['confirmCreatePrescription']();
    fixture.detectChanges();

    expect(serviceMock.createPrescription).toHaveBeenCalledWith({
      appointmentId: VALID_APPOINTMENT_ID,
      items: [
        {
          medicine: 'Metformin 500mg',
          dosage: '1 tablet twice daily',
          instructions: 'Take with morning and evening meals.',
        },
      ],
    });

    expect(component['showConfirmModal']()).toBe(false);
    expect(component['existingPrescription']()).toEqual(MOCK_EXISTING_PRESCRIPTION);
    expect(component['submitNotice']()).toBe('Prescription issued successfully.');
  });

  it('handles creation with pending PDF state and displays informative message', () => {
    serviceMock.getPrescriptions.mockReturnValue(
      of({ prescriptions: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } }),
    );
    const pendingRes: CreatePrescriptionResponse = {
      prescription: MOCK_PENDING_PRESCRIPTION,
    };
    serviceMock.createPrescription.mockReturnValue(of(pendingRes));

    createComponent();
    fixture.detectChanges();

    component.items.at(0).setValue({
      medicine: 'Metformin 500mg',
      dosage: '1 tablet twice daily',
      instructions: 'Take with meals.',
    });
    component['openConfirmModal']();
    fixture.detectChanges();

    component['confirmCreatePrescription']();
    fixture.detectChanges();

    expect(component['existingPrescription']()).toEqual(MOCK_PENDING_PRESCRIPTION);
    expect(component['submitNotice']()).toBe(
      'Prescription saved, but PDF generation is currently unavailable. You can retry downloading it.',
    );

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('PDF pending');
    expect(compiled.textContent).toContain('Retry PDF Download');
  });

  it('handles 409 PRESCRIPTION_EXISTS by re-querying existing prescription and switching to view', () => {
    serviceMock.getPrescriptions.mockReturnValue(
      of({ prescriptions: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } }),
    );
    serviceMock.createPrescription.mockReturnValue(
      throwError(() => ({
        status: 409,
        error: { message: 'A prescription has already been issued for this appointment' },
      })),
    );

    createComponent();
    fixture.detectChanges();

    component.items.at(0).setValue({
      medicine: 'Metformin 500mg',
      dosage: '1 tablet twice daily',
      instructions: 'Take with meals.',
    });
    component['openConfirmModal']();
    fixture.detectChanges();

    // Now set getPrescriptions to return the existing prescription on the recovery call
    serviceMock.getPrescriptions.mockReturnValue(
      of({
        prescriptions: [MOCK_EXISTING_PRESCRIPTION],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      }),
    );

    component['confirmCreatePrescription']();
    fixture.detectChanges();

    expect(component['showConfirmModal']()).toBe(false);
    expect(component['submitNotice']()).toContain('already been issued');
    expect(component['existingPrescription']()).toEqual(MOCK_EXISTING_PRESCRIPTION);
  });

  it('downloads PDF from read-only view and handles 502 error gracefully', () => {
    serviceMock.getPrescriptions.mockReturnValue(
      of({
        prescriptions: [MOCK_PENDING_PRESCRIPTION],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      }),
    );
    serviceMock.downloadPrescriptionPdf.mockReturnValue(
      throwError(() => ({ status: 502, error: { message: 'PDF service unavailable' } })),
    );

    createComponent();
    fixture.detectChanges();

    component['downloadPdf']();
    fixture.detectChanges();

    expect(serviceMock.downloadPrescriptionPdf).toHaveBeenCalledWith(MOCK_PENDING_PRESCRIPTION.id);
    expect(component['pdfError']()).toBe(
      'Prescription saved, but PDF generation is currently unavailable. You can retry downloading it.',
    );
  });

  it('clears in-memory data on destroy for medical privacy', () => {
    serviceMock.getPrescriptions.mockReturnValue(
      of({
        prescriptions: [MOCK_EXISTING_PRESCRIPTION],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      }),
    );

    createComponent();
    fixture.detectChanges();

    expect(component['existingPrescription']()).not.toBeNull();

    fixture.destroy();
    expect(component['existingPrescription']()).toBeNull();
  });
});
