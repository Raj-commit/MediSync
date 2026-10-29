import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  MedicalRecord,
  MedicalRecordEntry,
  RecordPaginationInfo,
} from '../../../core/records/records.models';
import { RecordsService } from '../../../core/records/records.service';

@Component({
  selector: 'app-patient-records',
  imports: [RouterLink],
  templateUrl: './patient-records.html',
  styleUrl: './patient-records.css',
})
export class PatientRecords implements OnInit, OnDestroy {
  protected readonly recordsService = inject(RecordsService);

  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);
  protected readonly record = signal<MedicalRecord | null>(null);

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
    this.loadRecord(1);
  }

  ngOnDestroy(): void {
    // Medical privacy: immediately clear in-memory sensitive records when navigating away
    this.record.set(null);
  }

  loadRecord(page: number): void {
    this.loading.set(true);
    this.error.set(null);

    this.recordsService.getOwnRecord({ page, limit: 10 }).subscribe({
      next: (response) => {
        this.record.set(response.record);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        if (err.status === 0) {
          this.error.set('Cannot reach the server. Please try again.');
        } else {
          this.error.set(err.error?.message || 'Failed to load medical records.');
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
