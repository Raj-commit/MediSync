import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AvailabilitySlot } from '../../../core/availability/availability.models';
import { AvailabilityService } from '../../../core/availability/availability.service';

export interface DayGroup {
  dateLabel: string;
  slots: AvailabilitySlot[];
}

@Component({
  selector: 'app-availability',
  imports: [RouterLink],
  templateUrl: './availability.html',
  styleUrl: './availability.css',
})
export class Availability implements OnInit {
  private readonly availabilityService = inject(AvailabilityService);

  protected readonly slots = signal<AvailabilitySlot[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);

  protected readonly groupedSlots = computed<DayGroup[]>(() => {
    const list = this.slots();
    const groupsMap = new Map<string, AvailabilitySlot[]>();

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
    this.loadSlots();
  }

  protected loadSlots(): void {
    this.loading.set(true);
    this.error.set(null);

    this.availabilityService.getAvailability().subscribe({
      next: (response) => {
        this.loading.set(false);
        this.slots.set(response.slots);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(
          err.status === 0
            ? 'Cannot reach the server. Please try again.'
            : (err.error?.message ?? 'Failed to load availability. Please try again.'),
        );
      },
    });
  }

  protected formatTime(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  }
}
