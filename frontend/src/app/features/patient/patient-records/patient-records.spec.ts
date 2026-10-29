import '@angular/compiler';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MedicalRecordResponse } from '../../../core/records/records.models';
import { RecordsService } from '../../../core/records/records.service';
import { PatientRecords } from './patient-records';

const MOCK_EMPTY_RESPONSE: MedicalRecordResponse = {
  record: {
    patient: {
      id: '507f1f77bcf86cd799439011',
      name: 'Asha Sharma',
      age: 28,
    },
    entries: [],
    pagination: {
      page: 1,
      limit: 10,
      total: 0,
      totalPages: 0,
    },
  },
};

const MOCK_ENTRIES_RESPONSE: MedicalRecordResponse = {
  record: {
    patient: {
      id: '507f1f77bcf86cd799439011',
      name: 'Asha Sharma',
      age: 28,
    },
    entries: [
      {
        id: 'entry-1',
        diagnosis: 'Hypertension Stage 1',
        notes: 'Line 1: Low sodium diet.\nLine 2: Regular exercise.',
        updatedAt: '2026-10-29T10:00:00.000Z',
        updatedBy: {
          id: '507f191e810c19729de860ea',
          name: 'Vikram Sen',
        },
      },
      {
        id: 'entry-2',
        diagnosis: 'Seasonal Allergies',
        notes: 'Prescribed antihistamines for 10 days.',
        updatedAt: '2026-10-20T08:30:00.000Z',
        updatedBy: {
          id: '507f191e810c19729de860eb',
          name: 'Anita Roy',
        },
      },
    ],
    pagination: {
      page: 1,
      limit: 2,
      total: 4,
      totalPages: 2,
    },
  },
};

describe('PatientRecords', () => {
  let fixture: ComponentFixture<PatientRecords>;
  let component: PatientRecords;
  let recordsServiceMock: {
    getOwnRecord: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    recordsServiceMock = {
      getOwnRecord: vi.fn(),
      clear: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [PatientRecords],
      providers: [
        provideRouter([]),
        { provide: RecordsService, useValue: recordsServiceMock },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders loading state initially before records arrive', () => {
    recordsServiceMock.getOwnRecord.mockReturnValue(of(MOCK_EMPTY_RESPONSE));
    fixture = TestBed.createComponent(PatientRecords);
    component = fixture.componentInstance;

    // Before change detection
    expect(component['loading']()).toBe(true);
  });

  it('displays empty state when patient has no entries', async () => {
    recordsServiceMock.getOwnRecord.mockReturnValue(of(MOCK_EMPTY_RESPONSE));
    fixture = TestBed.createComponent(PatientRecords);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.empty-box')).not.toBeNull();
    expect(el.querySelector('.empty-box h2')?.textContent).toContain('No entries yet');
    expect(el.querySelector('a[routerLink="/patient/doctors"]')).not.toBeNull();
  });

  it('displays entry list with diagnosis, doctor name, and formatted date', async () => {
    recordsServiceMock.getOwnRecord.mockReturnValue(of(MOCK_ENTRIES_RESPONSE));
    fixture = TestBed.createComponent(PatientRecords);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const cards = el.querySelectorAll('.record-card');
    expect(cards.length).toBe(2);

    expect(cards[0].querySelector('.diagnosis-title')?.textContent).toContain('Hypertension Stage 1');
    expect(cards[0].querySelector('.doctor-name')?.textContent).toContain('Dr. Vikram Sen');
    expect(cards[0].querySelector('.notes-content')?.textContent).toContain('Line 1: Low sodium diet.');

    expect(cards[1].querySelector('.diagnosis-title')?.textContent).toContain('Seasonal Allergies');
    expect(cards[1].querySelector('.doctor-name')?.textContent).toContain('Dr. Anita Roy');
  });

  it('renders notes as plain text (XSS defense) preserving multiline text via CSS', async () => {
    const xssPayload: MedicalRecordResponse = {
      record: {
        patient: { id: 'p1', name: 'Asha', age: 28 },
        entries: [
          {
            id: 'entry-xss',
            diagnosis: 'Test <script>alert("xss")</script>',
            notes: '<b>Bold text</b> <img src=x onerror=alert(1)>',
            updatedAt: '2026-10-29T10:00:00.000Z',
            updatedBy: { id: 'd1', name: 'Doctor' },
          },
        ],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      },
    };

    recordsServiceMock.getOwnRecord.mockReturnValue(of(xssPayload));
    fixture = TestBed.createComponent(PatientRecords);
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const notesEl = el.querySelector('.notes-content') as HTMLElement;
    // Must be escaped as plain text, NOT injected as HTML elements
    expect(notesEl.innerHTML).not.toContain('<img src="x"');
    expect(notesEl.textContent).toContain('<b>Bold text</b> <img src=x onerror=alert(1)>');
  });

  it('renders pagination controls and requests next page on click', async () => {
    recordsServiceMock.getOwnRecord.mockReturnValue(of(MOCK_ENTRIES_RESPONSE));
    fixture = TestBed.createComponent(PatientRecords);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const paginationNav = el.querySelector('.pagination-nav');
    expect(paginationNav).not.toBeNull();
    expect(el.querySelector('.page-indicator')?.textContent).toContain('Page 1 of 2');

    // Click Next button
    const nextBtn = paginationNav?.querySelectorAll('button')[1] as HTMLButtonElement;
    expect(nextBtn).toBeDefined();
    nextBtn.click();

    expect(recordsServiceMock.getOwnRecord).toHaveBeenCalledWith({ page: 2, limit: 10 });
  });

  it('displays error state when API fails and allows retry', async () => {
    recordsServiceMock.getOwnRecord.mockReturnValue(
      throwError(() => ({ status: 500, error: { message: 'Database connection failed' } })),
    );

    fixture = TestBed.createComponent(PatientRecords);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.error-box')).not.toBeNull();
    expect(el.querySelector('.error')?.textContent).toContain('Database connection failed');

    // Clicking "Try again" triggers another request
    recordsServiceMock.getOwnRecord.mockReturnValue(of(MOCK_EMPTY_RESPONSE));
    const retryBtn = el.querySelector('.error-box button') as HTMLButtonElement;
    retryBtn.click();

    expect(recordsServiceMock.getOwnRecord).toHaveBeenCalledTimes(2);
  });

  it('displays safe message when server cannot be reached (status 0)', async () => {
    recordsServiceMock.getOwnRecord.mockReturnValue(throwError(() => ({ status: 0 })));

    fixture = TestBed.createComponent(PatientRecords);
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.error')?.textContent).toContain(
      'Cannot reach the server. Please try again.',
    );
  });

  it('clears in-memory record data when component is destroyed (privacy rule)', async () => {
    recordsServiceMock.getOwnRecord.mockReturnValue(of(MOCK_ENTRIES_RESPONSE));
    fixture = TestBed.createComponent(PatientRecords);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component['record']()).not.toBeNull();

    // Destroy component
    fixture.destroy();
    expect(component['record']()).toBeNull();
  });
});
