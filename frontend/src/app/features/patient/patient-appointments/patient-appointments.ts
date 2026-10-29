import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  AppointmentItem,
  AppointmentStatus,
  DoctorAvailabilitySlot,
  PaginationInfo,
} from '../../../core/appointments/appointments.models';
import { AppointmentsService } from '../../../core/appointments/appointments.service';

export interface DaySlotGroup {
  dateLabel: string;
  slots: DoctorAvailabilitySlot[];
}

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
  protected readonly actionSuccess = signal<string | null>(null);

  // Cancel state
  protected readonly cancelTarget = signal<AppointmentItem | null>(null);
  protected readonly submittingCancel = signal<boolean>(false);
  protected readonly cancelError = signal<string | null>(null);

  // Reschedule state
  protected readonly reschedulingAppointmentId = signal<string | null>(null);
  protected readonly doctorSlots = signal<DoctorAvailabilitySlot[]>([]);
  protected readonly rescheduleLoading = signal<boolean>(false);
  protected readonly rescheduleError = signal<string | null>(null);
  protected readonly selectedNewSlot = signal<DoctorAvailabilitySlot | null>(null);
  protected readonly submittingReschedule = signal<boolean>(false);

  // Group open slots chronologically by local date
  protected readonly doctorSlotGroups = computed<DaySlotGroup[]>(() => {
    const list = this.doctorSlots();
    const groupsMap = new Map<string, DoctorAvailabilitySlot[]>();

    for (const slot of list) {
      const date = new Date(slot.startTime);
      const dayKey = date.toLocaleDateString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      const existing = groupsMap.get(dayKey) ?? [];
      existing.push(slot);
      groupsMap.set(dayKey, existing);
    }

    return Array.from(groupsMap.entries()).map(([dateLabel, groupSlots]) => ({
      dateLabel,
      slots: groupSlots,
    }));
  });

  ngOnInit(): void {
    this.loadAppointments(1);
  }

  protected setTab(tab: 'upcoming' | 'past'): void {
    if (this.activeTab() === tab) {
      return;
    }
    this.activeTab.set(tab);
    this.reschedulingAppointmentId.set(null);
    this.cancelTarget.set(null);
    this.actionSuccess.set(null);
    this.loadAppointments(1);
  }

  protected onStatusChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.statusFilter.set(select.value as AppointmentStatus | '');
    this.reschedulingAppointmentId.set(null);
    this.cancelTarget.set(null);
    this.actionSuccess.set(null);
    this.loadAppointments(1);
  }

  protected onPageChange(page: number): void {
    this.reschedulingAppointmentId.set(null);
    this.cancelTarget.set(null);
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

  // --- Cancellation actions ---

  protected openCancelModal(apt: AppointmentItem): void {
    this.cancelTarget.set(apt);
    this.cancelError.set(null);
    this.actionSuccess.set(null);
  }

  protected closeCancelModal(): void {
    if (!this.submittingCancel()) {
      this.cancelTarget.set(null);
      this.cancelError.set(null);
    }
  }

  protected confirmCancel(): void {
    const target = this.cancelTarget();
    if (!target) return;

    this.submittingCancel.set(true);
    this.cancelError.set(null);

    this.appointmentsService.manageAppointment(target.id, { action: 'cancel' }).subscribe({
      next: (response) => {
        this.submittingCancel.set(false);
        this.cancelTarget.set(null);
        this.actionSuccess.set('Appointment cancelled successfully.');

        // Update appointment in current list
        this.appointments.update((list) =>
          list.map((a) =>
            a.id === target.id ? { ...a, status: response.appointment.status } : a,
          ),
        );
      },
      error: (err: HttpErrorResponse) => {
        this.submittingCancel.set(false);
        if (err.status === 0) {
          this.cancelError.set('Cannot reach the server. Please try again.');
        } else {
          this.cancelError.set(err.error?.message || 'Failed to cancel appointment.');
        }
      },
    });
  }

  // --- Rescheduling actions ---

  protected toggleReschedule(apt: AppointmentItem): void {
    if (!apt.doctor?.id) return;

    if (this.reschedulingAppointmentId() === apt.id) {
      this.cancelReschedule();
      return;
    }

    this.reschedulingAppointmentId.set(apt.id);
    this.selectedNewSlot.set(null);
    this.actionSuccess.set(null);
    this.loadDoctorSlots(apt.doctor.id, apt.dateTime);
  }

  protected cancelReschedule(): void {
    this.reschedulingAppointmentId.set(null);
    this.selectedNewSlot.set(null);
    this.rescheduleError.set(null);
    this.doctorSlots.set([]);
  }

  protected loadDoctorSlots(doctorId: string, currentStartIso?: string, preserveError = false): void {
    this.rescheduleLoading.set(true);
    if (!preserveError)
    this.rescheduleError.set(null);

    this.appointmentsService.getDoctorAvailability(doctorId).subscribe({
      next: (response) => {
        this.rescheduleLoading.set(false);
        // Exclude the current appointment's time slot
        const filtered = response.slots.filter((s) => s.startTime !== currentStartIso);
        this.doctorSlots.set(filtered);
      },
      error: (err: HttpErrorResponse) => {
        this.rescheduleLoading.set(false);
        if (err.status === 0) {
          this.rescheduleError.set('Cannot reach the server. Please try again.');
        } else {
          this.rescheduleError.set(err.error?.message || 'Failed to load available slots.');
        }
      },
    });
  }

  protected selectRescheduleSlot(slot: DoctorAvailabilitySlot): void {
    this.selectedNewSlot.set(slot);
    this.rescheduleError.set(null);
  }

  protected confirmReschedule(appointmentId: string, doctorId: string): void {
    const newSlot = this.selectedNewSlot();
    if (!newSlot) return;

    this.submittingReschedule.set(true);
    this.rescheduleError.set(null);

    this.appointmentsService
      .manageAppointment(appointmentId, {
        action: 'reschedule',
        slotId: newSlot.id,
      })
      .subscribe({
        next: (response) => {
          this.submittingReschedule.set(false);
          this.reschedulingAppointmentId.set(null);
          this.selectedNewSlot.set(null);
          this.actionSuccess.set(
            'Appointment rescheduled successfully! Status reset to requested for doctor confirmation.',
          );

          // Update appointment in current list
          this.appointments.update((list) =>
            list.map((a) =>
              a.id === appointmentId
                ? {
                    ...a,
                    dateTime: response.appointment.dateTime,
                    endTime: response.appointment.endTime,
                    status: response.appointment.status,
                  }
                : a,
            ),
          );
        },
        error: (err: HttpErrorResponse) => {
          this.submittingReschedule.set(false);
          if (err.status === 409) {
            // Slot taken: show message and refresh available slots immediately
            this.rescheduleError.set(
              err.error?.message || 'This slot is already booked. Available slots have been reloaded.',
            );
            this.selectedNewSlot.set(null);
            this.loadDoctorSlots(doctorId, undefined, true);
          } else if (err.status === 0) {
            this.rescheduleError.set('Cannot reach the server. Please try again.');
          } else {
            this.rescheduleError.set(err.error?.message || 'Failed to reschedule appointment.');
          }
        },
      });
  }

  protected isActionable(apt: AppointmentItem): boolean {
    const isFuture = new Date(apt.dateTime).getTime() > Date.now();
    return isFuture && (apt.status === 'requested' || apt.status === 'confirmed');
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

  protected formatTime(isoString: string): string {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
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
