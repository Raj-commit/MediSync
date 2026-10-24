import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import {
  DoctorAvailabilitySlot,
  DoctorSummary,
} from '../../../core/appointments/appointments.models';
import { AppointmentsService } from '../../../core/appointments/appointments.service';

export interface DaySlotGroup {
  dateLabel: string;
  slots: DoctorAvailabilitySlot[];
}

@Component({
  selector: 'app-doctor-booking',
  imports: [RouterLink],
  templateUrl: './doctor-booking.html',
  styleUrl: './doctor-booking.css',
})
export class DoctorBooking implements OnInit {
  protected readonly appointmentsService = inject(AppointmentsService);
  private readonly route = inject(ActivatedRoute);

  protected readonly doctorId = signal<string>('');
  protected readonly doctorDetails = signal<DoctorSummary | null>(null);
  protected readonly doctorName = signal<string>('');
  protected readonly slots = signal<DoctorAvailabilitySlot[]>([]);
  protected readonly selectedSlot = signal<DoctorAvailabilitySlot | null>(null);

  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);

  // Groups open slots chronologically by local date
  protected readonly groupedSlots = computed<DaySlotGroup[]>(() => {
    const list = this.slots();
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
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.doctorId.set(id);

    // Check if doctor details were passed via navigation state (Option 1)
    const navState = history.state?.doctor as DoctorSummary | undefined;
    if (navState && navState.id === id) {
      this.doctorDetails.set(navState);
      this.doctorName.set(navState.name);
    }

    this.loadSlots();
  }

  protected loadSlots(): void {
    const id = this.doctorId();
    if (!id) {
      this.error.set('Invalid doctor ID');
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.appointmentsService.getDoctorAvailability(id).subscribe({
      next: (response) => {
        this.loading.set(false);
        if (!this.doctorName()) {
          this.doctorName.set(response.doctor.name);
        }
        this.slots.set(response.slots);

        // If previously selected slot is no longer in open slots, clear selection
        const currentSelected = this.selectedSlot();
        if (currentSelected && !response.slots.some((s) => s.id === currentSelected.id)) {
          this.selectedSlot.set(null);
        }
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(
          err.status === 0
            ? 'Cannot reach the server. Please try again.'
            : (err.error?.message ?? 'Failed to load doctor availability. Please try again.'),
        );
      },
    });
  }

  protected selectSlot(slot: DoctorAvailabilitySlot): void {
    if (this.selectedSlot()?.id === slot.id) {
      this.selectedSlot.set(null);
    } else {
      this.selectedSlot.set(slot);
    }
  }

  protected formatTime(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  protected formatFullDateTime(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
}
