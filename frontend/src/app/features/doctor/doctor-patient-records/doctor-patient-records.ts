import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import {
  AddRecordEntryRequest,
  MedicalRecord,
  MedicalRecordEntry,
  RecordPaginationInfo,
  RecordPatientSummary,
} from '../../../core/records/records.models';
import { RecordsService } from '../../../core/records/records.service';

function trimmedRequired(control: AbstractControl<string>): ValidationErrors | null {
  const value = control.value;
  if (!value || typeof value !== 'string' || value.trim() === '') {
    return { required: true };
  }
  return null;
}

@Component({
  selector: 'app-doctor-patient-records',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './doctor-patient-records.html',
  styleUrl: './doctor-patient-records.css',
})
export class DoctorPatientRecords implements OnInit, OnDestroy {
  protected readonly route = inject(ActivatedRoute);
  protected readonly recordsService = inject(RecordsService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly patientId = signal<string>('');
  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);
  protected readonly record = signal<MedicalRecord | null>(null);

  // Form signals & state
  protected readonly submitting = signal<boolean>(false);
  protected readonly actionSuccess = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly showConfirmDialog = signal<boolean>(false);

  protected readonly form = this.fb.group({
    diagnosis: ['', [trimmedRequired, Validators.maxLength(300)]],
    notes: ['', [trimmedRequired, Validators.maxLength(3000)]],
  });

  protected readonly diagnosisValue = toSignal(this.form.controls.diagnosis.valueChanges, {
    initialValue: '',
  });
  protected readonly notesValue = toSignal(this.form.controls.notes.valueChanges, {
    initialValue: '',
  });

  protected readonly diagnosisCount = computed(() => this.diagnosisValue().length);
  protected readonly notesCount = computed(() => this.notesValue().length);

  protected readonly patient = computed<RecordPatientSummary | null>(() => {
    return this.record()?.patient ?? null;
  });

  protected readonly entries = computed<MedicalRecordEntry[]>(() => {
    return this.record()?.entries ?? [];
  });

  protected readonly pagination = computed<RecordPaginationInfo>(() => {
    return (
      this.record()?.pagination ?? {
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
      }
    );
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('patientId') ?? '';
    this.patientId.set(id);

    // Validate ID before sending any network request
    if (!this.recordsService.isValidPatientId(id)) {
      this.loading.set(false);
      this.error.set('Invalid patient record link.');
      return;
    }

    this.loadRecord(1);
  }

  ngOnDestroy(): void {
    // Medical privacy: immediately clear in-memory sensitive records when navigating away
    this.record.set(null);
  }

  loadRecord(page: number): void {
    this.loading.set(true);
    this.error.set(null);

    this.recordsService.getPatientRecord(this.patientId(), { page, limit: 10 }).subscribe({
      next: (response) => {
        this.record.set(response.record);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        if (err.status === 404) {
          // Anti-enumeration: safe generic message for missing appointment or patient
          this.error.set('Medical record not available.');
        } else if (err.status === 403) {
          this.error.set('You do not have permission to view this medical record.');
        } else if (err.status === 0) {
          this.error.set('Cannot reach the server. Please try again.');
        } else {
          this.error.set(err.error?.message || 'Failed to load medical record.');
        }
      },
    });
  }

  onPageChange(page: number): void {
    this.loadRecord(page);
  }

  onSubmit(): void {
    this.actionSuccess.set(null);
    this.actionError.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.showConfirmDialog.set(true);
  }

  closeConfirmDialog(): void {
    if (!this.submitting()) {
      this.showConfirmDialog.set(false);
    }
  }

  confirmSaveEntry(): void {
    if (this.submitting() || this.form.invalid) {
      return;
    }

    this.submitting.set(true);
    this.actionError.set(null);

    const payload: AddRecordEntryRequest = {
      diagnosis: this.form.controls.diagnosis.value.trim(),
      notes: this.form.controls.notes.value.trim(),
    };

    this.recordsService.addEntry(this.patientId(), payload).subscribe({
      next: (response) => {
        this.submitting.set(false);
        this.showConfirmDialog.set(false);
        this.actionSuccess.set('Medical record entry added successfully.');

        // Prepend new entry to current record list in memory
        const current = this.record();
        if (current) {
          this.record.set({
            ...current,
            entries: [response.entry, ...current.entries],
            pagination: {
              ...current.pagination,
              total: current.pagination.total + 1,
            },
          });
        }

        // Clear form after successful addition
        this.form.reset({ diagnosis: '', notes: '' });
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.showConfirmDialog.set(false);

        // Server error shown as written; form keeps what doctor typed
        if (err.status === 0) {
          this.actionError.set('Cannot reach the server. Please try again.');
        } else {
          this.actionError.set(err.error?.message || 'Failed to save medical record entry.');
        }
      },
    });
  }

  formatDateTime(iso: string): string {
    const date = new Date(iso);
    if (isNaN(date.getTime())) {
      return iso;
    }
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
}
