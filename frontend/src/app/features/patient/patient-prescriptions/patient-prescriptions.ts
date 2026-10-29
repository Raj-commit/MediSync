import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  Prescription,
  PrescriptionPagination,
} from '../../../core/prescriptions/prescription.models';
import { PrescriptionsService } from '../../../core/prescriptions/prescription.service';

@Component({
  selector: 'app-patient-prescriptions',
  imports: [RouterLink],
  templateUrl: './patient-prescriptions.html',
  styleUrl: './patient-prescriptions.css',
})
export class PatientPrescriptions implements OnInit, OnDestroy {
  protected readonly prescriptionsService = inject(PrescriptionsService);

  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);
  protected readonly prescriptions = signal<Prescription[]>([]);
  protected readonly pagination = signal<PrescriptionPagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });

  protected readonly downloadingId = signal<string | null>(null);
  protected readonly downloadError = signal<string | null>(null);

  ngOnInit(): void {
    this.loadPrescriptions(1);
  }

  ngOnDestroy(): void {
    // Medical privacy: immediately clear in-memory prescriptions when navigating away
    this.prescriptions.set([]);
    this.downloadingId.set(null);
    this.downloadError.set(null);
    this.error.set(null);
  }

  protected loadPrescriptions(page: number): void {
    this.loading.set(true);
    this.error.set(null);
    this.downloadError.set(null);

    this.prescriptionsService.getPrescriptions({ page, limit: 10 }).subscribe({
      next: (response) => {
        this.prescriptions.set(response.prescriptions);
        this.pagination.set(response.pagination);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        if (err.status === 0) {
          this.error.set('Cannot reach the server. Please try again.');
        } else {
          this.error.set(err.error?.message || 'Failed to load prescriptions.');
        }
      },
    });
  }

  protected onPageChange(page: number): void {
    this.loadPrescriptions(page);
  }

  protected downloadPdf(item: Prescription): void {
    if (this.downloadingId() === item.id) {
      return;
    }

    this.downloadingId.set(item.id);
    this.downloadError.set(null);

    this.prescriptionsService.downloadPrescriptionPdf(item.id).subscribe({
      next: (blob: Blob) => {
        this.downloadingId.set(null);
        try {
          this.prescriptionsService.triggerBlobDownload(blob, `prescription_${item.id}.pdf`);
        } catch (err: unknown) {
          this.downloadError.set(
            err instanceof Error ? err.message : 'Failed to download prescription PDF.',
          );
        }
      },
      error: (err) => {
        this.downloadingId.set(null);
        if (err.status === 0) {
          this.downloadError.set('Cannot reach the server. Please check your connection.');
        } else if (err.status === 502) {
          this.downloadError.set(
            'Prescription saved, but PDF generation is currently unavailable. You can retry downloading it.',
          );
        } else {
          this.downloadError.set(err.error?.message || 'Failed to download prescription PDF.');
        }
      },
    });
  }

  protected formatDate(dateString: string): string {
    if (!dateString) return '';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
}
