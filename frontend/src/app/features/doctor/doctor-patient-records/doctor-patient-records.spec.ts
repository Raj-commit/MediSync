import '@angular/compiler';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AddRecordEntryResponse,
  MedicalRecordResponse,
} from '../../../core/records/records.models';
import { RecordsService } from '../../../core/records/records.service';
import { DoctorPatientRecords } from './doctor-patient-records';

const VALID_ID = '507f1f77bcf86cd799439011';
const INVALID_ID = 'bad-id-123';

const MOCK_PATIENT_RECORD: MedicalRecordResponse = {
  record: {
    patient: {
      id: VALID_ID,
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
          name: 'Vikram Sen',
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

const MOCK_SAVED_ENTRY_RESPONSE: AddRecordEntryResponse = {
  entry: {
    id: 'entry-new',
    diagnosis: 'Type 2 Diabetes',
    notes: 'Prescribed Metformin 500mg daily. Follow up in 30 days.',
    updatedAt: '2026-10-29T12:00:00.000Z',
    updatedBy: {
      id: '507f191e810c19729de860ea',
      name: 'Vikram Sen',
    },
  },
};

describe('DoctorPatientRecords', () => {
  let fixture: ComponentFixture<DoctorPatientRecords>;
  let component: DoctorPatientRecords;
  let recordsServiceMock: {
    isValidPatientId: ReturnType<typeof vi.fn>;
    getPatientRecord: ReturnType<typeof vi.fn>;
    addEntry: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };
  let routeMock: {
    snapshot: {
      paramMap: {
        get: ReturnType<typeof vi.fn>;
      };
    };
  };

  beforeEach(async () => {
    recordsServiceMock = {
      isValidPatientId: vi.fn((id: string) => /^[0-9a-fA-F]{24}$/.test(id)),
      getPatientRecord: vi.fn(),
      addEntry: vi.fn(),
      clear: vi.fn(),
    };

    routeMock = {
      snapshot: {
        paramMap: {
          get: vi.fn((key: string) => (key === 'patientId' ? VALID_ID : null)),
        },
      },
    };

    await TestBed.configureTestingModule({
      imports: [DoctorPatientRecords],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: routeMock },
        { provide: RecordsService, useValue: recordsServiceMock },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects invalid patientId before firing request', async () => {
    routeMock.snapshot.paramMap.get.mockReturnValue(INVALID_ID);

    fixture = TestBed.createComponent(DoctorPatientRecords);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(recordsServiceMock.getPatientRecord).not.toHaveBeenCalled();
    expect(el.querySelector('.error')?.textContent).toContain('Invalid patient record link.');
  });

  it('loads and displays patient summary with name and age', async () => {
    recordsServiceMock.getPatientRecord.mockReturnValue(of(MOCK_PATIENT_RECORD));

    fixture = TestBed.createComponent(DoctorPatientRecords);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.patient-name')?.textContent).toContain('Asha Sharma');
    expect(el.querySelector('.patient-age-badge')?.textContent).toContain('28');
    expect(el.querySelectorAll('.record-card').length).toBe(1);
    expect(el.querySelector('.diagnosis-title')?.textContent).toContain('Hypertension Stage 1');
  });

  it('displays safe anti-enumeration message on 404', async () => {
    recordsServiceMock.getPatientRecord.mockReturnValue(
      throwError(() => ({ status: 404, error: { message: 'Patient not found' } })),
    );

    fixture = TestBed.createComponent(DoctorPatientRecords);
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.error')?.textContent).toContain('Medical record not available.');
  });

  it('displays forbidden message on 403', async () => {
    recordsServiceMock.getPatientRecord.mockReturnValue(
      throwError(() => ({ status: 403, error: { message: 'Forbidden' } })),
    );

    fixture = TestBed.createComponent(DoctorPatientRecords);
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.error')?.textContent).toContain(
      'You do not have permission to view this medical record.',
    );
  });

  it('displays network error message on status 0', async () => {
    recordsServiceMock.getPatientRecord.mockReturnValue(throwError(() => ({ status: 0 })));

    fixture = TestBed.createComponent(DoctorPatientRecords);
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.error')?.textContent).toContain(
      'Cannot reach the server. Please try again.',
    );
  });

  it('displays empty state when patient has no past entries', async () => {
    const emptyRecord: MedicalRecordResponse = {
      record: {
        patient: { id: VALID_ID, name: 'Asha Sharma', age: 28 },
        entries: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
      },
    };

    recordsServiceMock.getPatientRecord.mockReturnValue(of(emptyRecord));
    fixture = TestBed.createComponent(DoctorPatientRecords);
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.empty-box')?.textContent).toContain('No past entries on record');
  });

  it('clears in-memory record on destroy', async () => {
    recordsServiceMock.getPatientRecord.mockReturnValue(of(MOCK_PATIENT_RECORD));
    fixture = TestBed.createComponent(DoctorPatientRecords);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component['record']()).not.toBeNull();
    fixture.destroy();
    expect(component['record']()).toBeNull();
  });

  describe('Add Entry Form and Confirmation', () => {
    beforeEach(async () => {
      recordsServiceMock.getPatientRecord.mockReturnValue(of(MOCK_PATIENT_RECORD));
      fixture = TestBed.createComponent(DoctorPatientRecords);
      component = fixture.componentInstance;
      fixture.detectChanges();
      await fixture.whenStable();
    });

    it('displays form with character counters and immutability notice', () => {
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('#add-entry-heading')?.textContent).toContain('Add Consultation Entry');
      expect(el.querySelector('.immutability-notice')?.textContent).toContain(
        'Entries cannot be edited or deleted once saved.',
      );
      expect(el.textContent).toContain('0 / 300');
      expect(el.textContent).toContain('0 / 3,000');
    });

    it('validates required trimmed fields and limits', () => {
      // Empty form is invalid
      expect(component['form'].invalid).toBe(true);

      // Whitespace only is invalid
      component['form'].setValue({ diagnosis: '   ', notes: '   ' });
      expect(component['form'].invalid).toBe(true);

      // Too long diagnosis is invalid
      component['form'].setValue({
        diagnosis: 'A'.repeat(301),
        notes: 'Valid notes',
      });
      expect(component['form'].invalid).toBe(true);

      // Valid input
      component['form'].setValue({
        diagnosis: 'Acute Bronchitis',
        notes: 'Advised rest and fluids.',
      });
      expect(component['form'].valid).toBe(true);
    });

    it('opens confirmation modal with summary when valid form is submitted', () => {
      component['form'].setValue({
        diagnosis: 'Type 2 Diabetes',
        notes: 'Prescribed Metformin 500mg daily.',
      });
      fixture.detectChanges();

      component.onSubmit();
      fixture.detectChanges();

      expect(component['showConfirmDialog']()).toBe(true);
      const el = fixture.nativeElement as HTMLElement;
      const modal = el.querySelector('.modal-dialog');
      expect(modal).not.toBeNull();
      expect(modal?.querySelector('#confirm-dialog-title')?.textContent).toContain(
        'Confirm Permanent Medical Entry',
      );
      expect(modal?.querySelector('.summary-diagnosis')?.textContent).toContain('Type 2 Diabetes');
      expect(modal?.querySelector('.summary-notes-text')?.textContent).toContain(
        'Prescribed Metformin 500mg daily.',
      );
    });

    it('closes confirmation modal when "Back to edit" is clicked without saving', () => {
      component['form'].setValue({
        diagnosis: 'Type 2 Diabetes',
        notes: 'Prescribed Metformin 500mg daily.',
      });
      component.onSubmit();
      fixture.detectChanges();

      expect(component['showConfirmDialog']()).toBe(true);

      component.closeConfirmDialog();
      fixture.detectChanges();

      expect(component['showConfirmDialog']()).toBe(false);
      expect(recordsServiceMock.addEntry).not.toHaveBeenCalled();
    });

    it('saves entry on confirmation, resets form, and updates entry list with success banner', async () => {
      recordsServiceMock.addEntry.mockReturnValue(of(MOCK_SAVED_ENTRY_RESPONSE));

      component['form'].setValue({
        diagnosis: 'Type 2 Diabetes',
        notes: 'Prescribed Metformin 500mg daily. Follow up in 30 days.',
      });
      component.onSubmit();
      fixture.detectChanges();

      component.confirmSaveEntry();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(recordsServiceMock.addEntry).toHaveBeenCalledWith(VALID_ID, {
        diagnosis: 'Type 2 Diabetes',
        notes: 'Prescribed Metformin 500mg daily. Follow up in 30 days.',
      });

      // Dialog closed
      expect(component['showConfirmDialog']()).toBe(false);

      // Form reset
      expect(component['form'].controls.diagnosis.value).toBe('');
      expect(component['form'].controls.notes.value).toBe('');

      // New entry added to the top of entries list
      expect(component['entries']().length).toBe(2);
      expect(component['entries']()[0].diagnosis).toBe('Type 2 Diabetes');

      // Success banner visible
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.success-box')?.textContent).toContain(
        'Medical record entry added successfully.',
      );
    });

    it('preserves typed text in form if server returns an error', async () => {
      recordsServiceMock.addEntry.mockReturnValue(
        throwError(() => ({
          status: 400,
          error: { message: 'diagnosis must not exceed 300 characters' },
        })),
      );

      const typedDiagnosis = 'Hypertension';
      const typedNotes = 'Check blood pressure daily.';
      component['form'].setValue({
        diagnosis: typedDiagnosis,
        notes: typedNotes,
      });

      component.onSubmit();
      component.confirmSaveEntry();
      fixture.detectChanges();
      await fixture.whenStable();

      // Modal closed
      expect(component['showConfirmDialog']()).toBe(false);

      // Error message shown
      expect(component['actionError']()).toBe('diagnosis must not exceed 300 characters');

      // Crucial: Typed text is NOT lost!
      expect(component['form'].controls.diagnosis.value).toBe(typedDiagnosis);
      expect(component['form'].controls.notes.value).toBe(typedNotes);
    });
  });
});
