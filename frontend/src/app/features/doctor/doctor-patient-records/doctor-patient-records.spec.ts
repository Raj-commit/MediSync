import '@angular/compiler';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MedicalRecordResponse } from '../../../core/records/records.models';
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

describe('DoctorPatientRecords', () => {
  let fixture: ComponentFixture<DoctorPatientRecords>;
  let component: DoctorPatientRecords;
  let recordsServiceMock: {
    isValidPatientId: ReturnType<typeof vi.fn>;
    getPatientRecord: ReturnType<typeof vi.fn>;
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
});
