import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  AppointmentItem,
  AppointmentStatus,
  PaginationInfo,
} from '../../../core/appointments/appointments.models';
import { AppointmentsService } from '../../../core/appointments/appointments.service';
import { VideoService } from '../../../core/video/video.service';

@Component({
  selector: 'app-doctor-appointments',
  imports: [RouterLink],
  templateUrl: './doctor-appointments.html',
  styleUrl: './doctor-appointments.css',
})
export class DoctorAppointments implements OnInit {
  protected readonly appointmentsService = inject(AppointmentsService);
  protected readonly videoService = inject(VideoService);

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
  protected readonly actionSuccess = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly submittingActionId = signal<string | null>(null);

  // Reject modal state
  protected readonly rejectTarget = signal<AppointmentItem | null>(null);
  protected readonly submittingReject = signal<boolean>(false);
  protected readonly rejectError = signal<string | null>(null);

  ngOnInit(): void {
    this.loadAppointments(1);
  }

  protected setTab(tab: 'upcoming' | 'past'): void {
    if (this.activeTab() === tab) {
      return;
    }
    this.activeTab.set(tab);
    this.rejectTarget.set(null);
    this.actionSuccess.set(null);
    this.actionError.set(null);
    this.loadAppointments(1);
  }

  protected onStatusChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.statusFilter.set(select.value as AppointmentStatus | '');
    this.rejectTarget.set(null);
    this.actionSuccess.set(null);
    this.actionError.set(null);
    this.loadAppointments(1);
  }

  protected onPageChange(page: number): void {
    this.rejectTarget.set(null);
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

  // --- Doctor actions ---

  protected acceptAppointment(apt: AppointmentItem): void {
    this.submittingActionId.set(apt.id);
    this.actionError.set(null);
    this.actionSuccess.set(null);

    this.appointmentsService.manageAppointment(apt.id, { action: 'accept' }).subscribe({
      next: (response) => {
        this.submittingActionId.set(null);
        this.actionSuccess.set('Appointment accepted and confirmed.');
        this.appointments.update((list) =>
          list.map((a) => (a.id === apt.id ? { ...a, status: response.appointment.status } : a)),
        );
      },
      error: (err: HttpErrorResponse) => {
        this.submittingActionId.set(null);
        if (err.status === 0) {
          this.actionError.set('Cannot reach the server. Please try again.');
        } else {
          this.actionError.set(err.error?.message || 'Failed to accept appointment.');
        }
      },
    });
  }

  protected openRejectModal(apt: AppointmentItem): void {
    this.rejectTarget.set(apt);
    this.rejectError.set(null);
    this.actionSuccess.set(null);
    this.actionError.set(null);
  }

  protected closeRejectModal(): void {
    if (!this.submittingReject()) {
      this.rejectTarget.set(null);
      this.rejectError.set(null);
    }
  }

  protected confirmReject(): void {
    const target = this.rejectTarget();
    if (!target) return;

    this.submittingReject.set(true);
    this.rejectError.set(null);

    this.appointmentsService.manageAppointment(target.id, { action: 'reject' }).subscribe({
      next: (response) => {
        this.submittingReject.set(false);
        this.rejectTarget.set(null);
        this.actionSuccess.set('Appointment rejected. The time slot has been released.');
        this.appointments.update((list) =>
          list.map((a) => (a.id === target.id ? { ...a, status: response.appointment.status } : a)),
        );
      },
      error: (err: HttpErrorResponse) => {
        this.submittingReject.set(false);
        if (err.status === 0) {
          this.rejectError.set('Cannot reach the server. Please try again.');
        } else {
          this.rejectError.set(err.error?.message || 'Failed to reject appointment.');
        }
      },
    });
  }

  protected completeAppointment(apt: AppointmentItem): void {
    this.submittingActionId.set(apt.id);
    this.actionError.set(null);
    this.actionSuccess.set(null);

    this.appointmentsService.manageAppointment(apt.id, { action: 'complete' }).subscribe({
      next: (response) => {
        this.submittingActionId.set(null);
        this.actionSuccess.set('Appointment marked as completed.');
        this.appointments.update((list) =>
          list.map((a) => (a.id === apt.id ? { ...a, status: response.appointment.status } : a)),
        );
      },
      error: (err: HttpErrorResponse) => {
        this.submittingActionId.set(null);
        if (err.status === 0) {
          this.actionError.set('Cannot reach the server. Please try again.');
        } else {
          this.actionError.set(err.error?.message || 'Failed to complete appointment.');
        }
      },
    });
  }

  protected canAccept(apt: AppointmentItem): boolean {
    const isFuture = new Date(apt.dateTime).getTime() > Date.now();
    return isFuture && apt.status === 'requested';
  }

  protected canReject(apt: AppointmentItem): boolean {
    return apt.status === 'requested';
  }

  protected canComplete(apt: AppointmentItem): boolean {
    const isStartedOrPast = new Date(apt.dateTime).getTime() <= Date.now();
    return isStartedOrPast && apt.status === 'confirmed';
  }

  protected canJoinVideo(apt: AppointmentItem): boolean {
    if (apt.status !== 'confirmed') return false;
    return this.videoService.isWithinCallWindow(apt.dateTime, apt.endTime);
  }

  protected canViewRecord(apt: AppointmentItem): boolean {
    return (apt.status === 'confirmed' || apt.status === 'completed') && !!apt.patient?.id;
  }

  protected canChat(apt: AppointmentItem): boolean {
    return apt.status === 'confirmed' || apt.status === 'completed';
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
