import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import {
  MedicalRecord,
  MedicalRecordEntry,
  RecordPaginationInfo,
  RecordPatientSummary,
} from '../../../core/records/records.models';
import { RecordsService } from '../../../core/records/records.service';

@Component({
  selector: 'app-doctor-patient-records',
  imports: [RouterLink],
  templateUrl: './doctor-patient-records.html',
  styleUrl: './doctor-patient-records.css',
})
export class DoctorPatientRecords implements OnInit, OnDestroy {
  protected readonly route = inject(ActivatedRoute);
  protected readonly recordsService = inject(RecordsService);

  protected readonly patientId = signal<string>('');
  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);
  protected readonly record = signal<MedicalRecord | null>(null);

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
      error: (err) => {
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
