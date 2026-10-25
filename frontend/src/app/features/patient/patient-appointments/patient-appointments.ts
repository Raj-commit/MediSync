import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  AppointmentItem,
  AppointmentStatus,
  PaginationInfo,
} from '../../../core/appointments/appointments.models';
import { AppointmentsService } from '../../../core/appointments/appointments.service';

@Component({
  selector: 'app-patient-appointments',
  imports: [RouterLink],
  templateUrl: './patient-appointments.html',
  styleUrl: './patient-appointments.css',
})
export class PatientAppointments implements OnInit {
  protected readonly appointmentsService = inject(AppointmentsService);

  protected readonly activeTab = signal<'upcoming' | 'past'>('upcoming');
  protected readonly statusFilter = signal<AppointmentStatus | ''>('');
  protected readonly appointments = signal<AppointmentItem[]>([]);
  protected readonly pagination = signal<PaginationInfo>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });

  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.loadAppointments(1);
  }

  protected setTab(tab: 'upcoming' | 'past'): void {
    if (this.activeTab() === tab) {
      return;
    }
    this.activeTab.set(tab);
    this.loadAppointments(1);
  }

  protected onStatusChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.statusFilter.set(select.value as AppointmentStatus | '');
    this.loadAppointments(1);
  }

  protected onPageChange(page: number): void {
    this.loadAppointments(page);
  }

  protected loadAppointments(page = 1): void {
    this.loading.set(true);
    this.error.set(null);

    const status = this.statusFilter();
    this.appointmentsService
      .getAppointments({
        when: this.activeTab(),
        status: status !== '' ? status : undefined,
        page,
        limit: 10,
      })
      .subscribe({
        next: (response) => {
          this.loading.set(false);
          this.appointments.set(response.appointments);
          this.pagination.set(response.pagination);
        },
        error: (err: HttpErrorResponse) => {
          this.loading.set(false);
          if (err.status === 0) {
            this.error.set('Cannot reach the server. Please try again.');
          } else {
            this.error.set(err.error?.message || 'Failed to load appointments.');
          }
        },
      });
  }

  protected formatDate(isoString: string): string {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  protected formatTimeRange(startIso: string, endIso: string): string {
    const start = new Date(startIso);
    const end = new Date(endIso);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return `${startIso} – ${endIso}`;
    }
    const timeOptions: Intl.DateTimeFormatOptions = {
      hour: 'numeric',
      minute: '2-digit',
    };
    return `${start.toLocaleTimeString(undefined, timeOptions)} – ${end.toLocaleTimeString(undefined, timeOptions)}`;
  }

  protected getStatusLabel(status: AppointmentStatus): string {
    switch (status) {
      case 'requested':
        return 'Requested';
      case 'confirmed':
        return 'Confirmed';
      case 'completed':
        return 'Completed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status;
    }
  }
}
