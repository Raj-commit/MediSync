import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';

import {
  AvailabilitySlot,
  UpdateSlotDto,
} from '../../../core/availability/availability.models';
import { AvailabilityService } from '../../../core/availability/availability.service';

export interface DayGroup {
  dateLabel: string;
  slots: AvailabilitySlot[];
}

const SLOT_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const MAX_SLOTS = 50;
const MAX_DAYS_AHEAD = 60;

@Component({
  selector: 'app-availability',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './availability.html',
  styleUrl: './availability.css',
})
export class Availability implements OnInit {
  private readonly availabilityService = inject(AvailabilityService);
  private readonly fb = inject(NonNullableFormBuilder);

  // Form bounds
  protected readonly minDate = this.formatDateInput(new Date());
  protected readonly maxDate = this.formatDateInput(
    new Date(Date.now() + MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000),
  );

  // Reactive form for Range Generator (Option c)
  readonly generatorForm = this.fb.group({
    date: [this.minDate, Validators.required],
    startTime: ['09:00', Validators.required],
    endTime: ['12:00', Validators.required],
  });

  // State signals
  protected readonly slots = signal<AvailabilitySlot[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly saving = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);
  protected readonly successMessage = signal<string | null>(null);
  protected readonly feedbackMessage = signal<string | null>(null);
  protected readonly hasUnsavedChanges = signal<boolean>(false);

  // Computed views
  protected readonly openSlotCount = computed(
    () => this.slots().filter((s) => !s.isBooked).length,
  );

  protected readonly bookedSlotCount = computed(
    () => this.slots().filter((s) => s.isBooked).length,
  );

  protected readonly groupedSlots = computed<DayGroup[]>(() => {
    // Sort all slots chronologically
    const sorted = [...this.slots()].sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );

    const groupsMap = new Map<string, AvailabilitySlot[]>();

    for (const slot of sorted) {
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
    this.hasUnsavedChanges.set(false);

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

  /**
   * Option (c) Range Generator:
   * Generates consecutive 30-minute slots between startTime and endTime on the selected date.
   */
  protected onGenerateSlots(): void {
    this.feedbackMessage.set(null);
    this.error.set(null);
    this.successMessage.set(null);

    if (this.generatorForm.invalid) {
      this.generatorForm.markAllAsTouched();
      return;
    }

    const { date: dateStr, startTime: startTimeStr, endTime: endTimeStr } =
      this.generatorForm.getRawValue();

    // Parse date and times in browser local time
    const [year, month, day] = dateStr.split('-').map(Number);
    const [startH, startM] = startTimeStr.split(':').map(Number);
    const [endH, endM] = endTimeStr.split(':').map(Number);

    const startLocal = new Date(year, month - 1, day, startH, startM, 0, 0);
    const endLocal = new Date(year, month - 1, day, endH, endM, 0, 0);

    const now = new Date();
    const maxFuture = new Date(now.getTime() + MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000);

    // Validation checks
    if (startLocal.getTime() >= endLocal.getTime()) {
      this.error.set('End time must be after start time.');
      return;
    }

    if (startLocal.getTime() <= now.getTime()) {
      this.error.set('Cannot create slots in the past.');
      return;
    }

    if (startLocal.getTime() > maxFuture.getTime()) {
      this.error.set(`Slots cannot be more than ${MAX_DAYS_AHEAD} days in the future.`);
      return;
    }

    const durationMs = endLocal.getTime() - startLocal.getTime();
    if (durationMs % SLOT_DURATION_MS !== 0) {
      this.error.set('Start and end times must be aligned to 30-minute intervals.');
      return;
    }

    const currentSlots = [...this.slots()];
    const currentOpenCount = currentSlots.filter((s) => !s.isBooked).length;

    let addedCount = 0;
    let skippedCount = 0;
    let cursor = startLocal.getTime();

    while (cursor + SLOT_DURATION_MS <= endLocal.getTime()) {
      const slotStart = new Date(cursor);
      const slotEnd = new Date(cursor + SLOT_DURATION_MS);

      // Check if slot overlaps with ANY existing slot (open or booked)
      const overlaps = currentSlots.some((existing) => {
        const existStart = new Date(existing.startTime).getTime();
        const existEnd = new Date(existing.endTime).getTime();
        return slotStart.getTime() < existEnd && slotEnd.getTime() > existStart;
      });

      if (overlaps) {
        skippedCount++;
      } else {
        if (currentOpenCount + addedCount >= MAX_SLOTS) {
          this.error.set(`Cannot add more than ${MAX_SLOTS} open slots. Please save or remove existing slots first.`);
          break;
        }

        const newSlot: AvailabilitySlot = {
          id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          startTime: slotStart.toISOString(),
          endTime: slotEnd.toISOString(),
          isBooked: false,
        };

        currentSlots.push(newSlot);
        addedCount++;
      }

      cursor += SLOT_DURATION_MS;
    }

    if (addedCount > 0) {
      this.slots.set(currentSlots);
      this.hasUnsavedChanges.set(true);

      const msg =
        skippedCount > 0
          ? `Generated ${addedCount} new slot(s). ${skippedCount} slot(s) skipped because they already exist or overlap.`
          : `Generated ${addedCount} new 30-minute slot(s). Remember to click "Save Changes".`;
      this.feedbackMessage.set(msg);
    } else if (skippedCount > 0 && !this.error()) {
      this.feedbackMessage.set(
        `No new slots were added. All ${skippedCount} slot(s) in this range already exist or overlap with your schedule.`,
      );
    }
  }

  /**
   * Removes an unbooked slot from the local draft.
   * Booked slots cannot be removed.
   */
  protected removeSlot(slotId: string): void {
    const target = this.slots().find((s) => s.id === slotId);
    if (!target || target.isBooked) {
      return;
    }

    this.slots.set(this.slots().filter((s) => s.id !== slotId));
    this.hasUnsavedChanges.set(true);
    this.feedbackMessage.set('Slot removed from schedule. Remember to click "Save Changes".');
    this.error.set(null);
  }

  /**
   * Saves open slots to the backend.
   * Sends ONLY unbooked open slots as UTC ISO strings. Booked slots are preserved on the server.
   */
  protected onSave(): void {
    this.error.set(null);
    this.successMessage.set(null);
    this.feedbackMessage.set(null);

    const openSlots = this.slots().filter((s) => !s.isBooked);

    if (openSlots.length > MAX_SLOTS) {
      this.error.set(`You cannot save more than ${MAX_SLOTS} slots at a time.`);
      return;
    }

    // Prepare payload in UTC ISO format
    const payload: UpdateSlotDto[] = openSlots.map((s) => ({
      startTime: new Date(s.startTime).toISOString(),
      endTime: new Date(s.endTime).toISOString(),
    }));

    this.saving.set(true);

    this.availabilityService.updateAvailability(payload).subscribe({
      next: (response) => {
        this.saving.set(false);
        this.hasUnsavedChanges.set(false);
        this.slots.set(response.slots);
        this.successMessage.set('Your availability has been saved successfully.');
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(
          err.status === 0
            ? 'Cannot reach the server. Please try again.'
            : (err.error?.message ?? 'Failed to save availability. Please try again.'),
        );
      },
    });
  }

  /**
   * Discards local unsaved changes and reloads the current slots from the server.
   */
  protected onDiscard(): void {
    this.feedbackMessage.set(null);
    this.loadSlots();
  }

  protected formatTime(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  private formatDateInput(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
