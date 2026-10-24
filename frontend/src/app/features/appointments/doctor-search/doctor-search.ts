import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import {
  DoctorSummary,
  PaginationInfo,
} from '../../../core/appointments/appointments.models';
import { AppointmentsService } from '../../../core/appointments/appointments.service';

@Component({
  selector: 'app-doctor-search',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './doctor-search.html',
  styleUrl: './doctor-search.css',
})
export class DoctorSearch implements OnInit {
  private readonly appointmentsService = inject(AppointmentsService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly searchForm = this.fb.group({
    name: [''],
    specialisation: [''],
  });

  protected readonly doctors = signal<DoctorSummary[]>([]);
  protected readonly pagination = signal<PaginationInfo>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  protected readonly loading = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.loadDoctors(1);
  }

  protected onSearch(): void {
    this.loadDoctors(1);
  }

  protected onReset(): void {
    this.searchForm.reset({ name: '', specialisation: '' });
    this.loadDoctors(1);
  }

  protected onPageChange(newPage: number): void {
    const current = this.pagination();
    if (newPage < 1 || (current.totalPages > 0 && newPage > current.totalPages)) {
      return;
    }
    this.loadDoctors(newPage);
  }

  protected loadDoctors(page: number): void {
    this.loading.set(true);
    this.error.set(null);

    const { name, specialisation } = this.searchForm.getRawValue();

    this.appointmentsService
      .searchDoctors({
        name: name.trim() || undefined,
        specialisation: specialisation.trim() || undefined,
        page,
        limit: 10,
      })
      .subscribe({
        next: (response) => {
          this.loading.set(false);
          this.doctors.set(response.doctors);
          this.pagination.set(response.pagination);
        },
        error: (err: HttpErrorResponse) => {
          this.loading.set(false);
          this.error.set(
            err.status === 0
              ? 'Cannot reach the server. Please try again.'
              : (err.error?.message ?? 'Failed to load doctors. Please try again.'),
          );
        },
      });
  }
}
