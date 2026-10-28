import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import {
  NotificationItem,
  NotificationStatus,
  PaginationInfo,
} from '../../core/notifications/notifications.models';
import { NotificationsService } from '../../core/notifications/notifications.service';

@Component({
  selector: 'app-notifications',
  imports: [RouterLink],
  templateUrl: './notifications.html',
  styleUrl: './notifications.css',
})
export class NotificationsPage implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly notificationsService = inject(NotificationsService);

  readonly notifications = signal<NotificationItem[]>([]);
  readonly pagination = signal<PaginationInfo>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });

  readonly filter = signal<'' | 'unread'>('');
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  // Tracks notification IDs currently being marked as read to prevent double-clicks
  readonly markingReadIds = signal<Set<string>>(new Set());

  // Dynamic links according to user role
  readonly dashboardPath = computed(() =>
    this.auth.role() === 'doctor' ? '/doctor' : '/patient',
  );

  readonly appointmentsPath = computed(() =>
    this.auth.role() === 'doctor' ? '/doctor/appointments' : '/patient/appointments',
  );

  ngOnInit(): void {
    this.loadNotifications(1);
  }

  setFilter(status: '' | 'unread'): void {
    if (this.filter() === status) {
      return;
    }
    this.filter.set(status);
    this.loadNotifications(1);
  }

  onPageChange(page: number): void {
    if (page < 1 || page > this.pagination().totalPages || this.loading()) {
      return;
    }
    this.loadNotifications(page);
  }

  loadNotifications(page = 1): void {
    this.loading.set(true);
    this.error.set(null);

    const queryStatus: NotificationStatus | undefined =
      this.filter() === 'unread' ? 'unread' : undefined;

    this.notificationsService
      .getNotifications({
        status: queryStatus,
        page,
        limit: 10,
      })
      .subscribe({
        next: (res) => {
          this.notifications.set(res.notifications);
          this.pagination.set(res.pagination);
          this.loading.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.error.set(this.getErrorMessage(err));
          this.loading.set(false);
        },
      });
  }

  markAsRead(item: NotificationItem): void {
    if (item.status === 'read' || this.markingReadIds().has(item.id)) {
      return;
    }

    const currentMarking = new Set(this.markingReadIds());
    currentMarking.add(item.id);
    this.markingReadIds.set(currentMarking);

    this.notificationsService.markAsRead(item.id).subscribe({
      next: (res) => {
        // Update local item status to read
        this.notifications.update((list) =>
          list.map((n) => (n.id === res.notification.id ? res.notification : n)),
        );

        // If filtering by unread, decrement total count and check pagination
        if (this.filter() === 'unread') {
          this.pagination.update((p) => ({
            ...p,
            total: Math.max(0, p.total - 1),
            totalPages: Math.ceil(Math.max(0, p.total - 1) / p.limit),
          }));
        }

        const updatedMarking = new Set(this.markingReadIds());
        updatedMarking.delete(item.id);
        this.markingReadIds.set(updatedMarking);
      },
      error: (err: HttpErrorResponse) => {
        const updatedMarking = new Set(this.markingReadIds());
        updatedMarking.delete(item.id);
        this.markingReadIds.set(updatedMarking);

        this.error.set(this.getErrorMessage(err));
      },
    });
  }

  isMarkingRead(id: string): boolean {
    return this.markingReadIds().has(id);
  }

  formatRelativeTime(isoString: string): string {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffInSeconds = Math.round((date.getTime() - now.getTime()) / 1000);

      const absDiff = Math.abs(diffInSeconds);
      if (absDiff < 60) {
        return 'just now';
      }

      const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

      const diffInMinutes = Math.round(diffInSeconds / 60);
      if (Math.abs(diffInMinutes) < 60) {
        return rtf.format(diffInMinutes, 'minute');
      }

      const diffInHours = Math.round(diffInMinutes / 60);
      if (Math.abs(diffInHours) < 24) {
        return rtf.format(diffInHours, 'hour');
      }

      const diffInDays = Math.round(diffInHours / 24);
      if (Math.abs(diffInDays) < 30) {
        return rtf.format(diffInDays, 'day');
      }

      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      });
    } catch {
      return isoString;
    }
  }

  formatFullDate(isoString: string): string {
    try {
      return new Date(isoString).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return isoString;
    }
  }

  private getErrorMessage(err: HttpErrorResponse): string {
    if (err.status === 0) {
      return 'Cannot reach the server. Please try again.';
    }
    return err.error?.message || 'Failed to load notifications. Please try again.';
  }
}
