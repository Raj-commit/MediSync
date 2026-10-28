import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable, OnDestroy, signal } from '@angular/core';
import { map, Observable, Subscription, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  GetNotificationsParams,
  MarkAsReadResponse,
  NotificationListResponse,
} from './notifications.models';

export const DEFAULT_POLL_INTERVAL_MS = 30_000;
export const MAX_POLL_INTERVAL_MS = 120_000;

@Injectable({
  providedIn: 'root',
})
export class NotificationsService implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/notifications`;

  private readonly _unreadCount = signal<number>(0);
  readonly unreadCount = this._unreadCount.asReadonly();

  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private currentIntervalMs = DEFAULT_POLL_INTERVAL_MS;
  private isPollingActive = false;
  private visibilityListener: (() => void) | null = null;
  private activePollSub: Subscription | null = null;

  /**
   * Fetches paginated notifications for the authenticated user.
   * Updates the shared unreadCount signal with the value returned by the backend.
   */
  getNotifications(params?: GetNotificationsParams): Observable<NotificationListResponse> {
    let httpParams = new HttpParams();

    if (params) {
      if (params.status) {
        httpParams = httpParams.set('status', params.status);
      }
      if (params.page !== undefined && params.page > 0) {
        httpParams = httpParams.set('page', params.page.toString());
      }
      if (params.limit !== undefined && params.limit > 0) {
        httpParams = httpParams.set('limit', params.limit.toString());
      }
    }

    return this.http
      .get<NotificationListResponse>(this.baseUrl, { params: httpParams })
      .pipe(tap((res) => this.setUnreadCount(res.unreadCount)));
  }

  /**
   * Refreshes the unread count by querying with limit=1 to minimize response payload.
   * The backend returns the global unreadCount regardless of pagination.
   */
  refreshUnreadCount(): Observable<number> {
    const params = new HttpParams().set('limit', '1');
    return this.http.get<NotificationListResponse>(this.baseUrl, { params }).pipe(
      map((res) => res.unreadCount),
      tap((count) => this.setUnreadCount(count)),
    );
  }

  /**
   * Marks an individual notification as read.
   * Decrements the unreadCount signal upon success.
   */
  markAsRead(notificationId: string): Observable<MarkAsReadResponse> {
    return this.http
      .patch<MarkAsReadResponse>(`${this.baseUrl}/${encodeURIComponent(notificationId)}/read`, {})
      .pipe(tap(() => this.decrementUnreadCount()));
  }

  /**
   * Updates the unread count signal directly.
   */
  setUnreadCount(count: number): void {
    this._unreadCount.set(Math.max(0, count));
  }

  /**
   * Decrements the unread count signal by 1, floored at 0.
   */
  decrementUnreadCount(): void {
    this._unreadCount.update((count) => Math.max(0, count - 1));
  }

  /**
   * Starts periodic polling for the unread count.
   * Pauses when the tab is hidden and resumes immediately when the tab becomes visible.
   * Doubles the polling interval on network/5xx server errors up to 120s, resetting on success.
   */
  startPolling(initialIntervalMs = DEFAULT_POLL_INTERVAL_MS): void {
    if (this.isPollingActive) {
      return;
    }

    this.isPollingActive = true;
    this.currentIntervalMs = initialIntervalMs;

    this.setupVisibilityListener();

    if (this.isDocumentVisible()) {
      this.pollOnce();
    }
  }

  /**
   * Stops periodic polling and cleans up any active timers and listeners.
   */
  stopPolling(): void {
    this.isPollingActive = false;
    this.clearPollTimer();

    if (this.activePollSub) {
      this.activePollSub.unsubscribe();
      this.activePollSub = null;
    }

    this.removeVisibilityListener();
  }

  /**
   * Resets all notification state (unread count to 0, cancels polling and timers).
   * Called on logout or when switching accounts.
   */
  clear(): void {
    this.stopPolling();
    this._unreadCount.set(0);
    this.currentIntervalMs = DEFAULT_POLL_INTERVAL_MS;
  }

  /**
   * Returns whether polling is currently active.
   */
  isPolling(): boolean {
    return this.isPollingActive;
  }

  /**
   * Returns current polling interval in milliseconds.
   */
  getCurrentIntervalMs(): number {
    return this.currentIntervalMs;
  }

  ngOnDestroy(): void {
    this.clear();
  }

  private pollOnce(): void {
    if (!this.isPollingActive) {
      return;
    }

    if (this.activePollSub) {
      this.activePollSub.unsubscribe();
    }

    this.activePollSub = this.refreshUnreadCount().subscribe({
      next: () => {
        this.currentIntervalMs = DEFAULT_POLL_INTERVAL_MS;
        this.scheduleNextPoll();
      },
      error: (err: HttpErrorResponse) => {
        this.handlePollError(err);
      },
    });
  }

  private handlePollError(err: HttpErrorResponse): void {
    if (err.status === 401 || err.status === 403) {
      // Authentication / authorization lost: stop polling immediately and clear state
      this.clear();
      return;
    }

    if (err.status === 0 || err.status >= 500) {
      // Network outage or server-side error: back off exponentially up to 120 seconds
      this.currentIntervalMs = Math.min(this.currentIntervalMs * 2, MAX_POLL_INTERVAL_MS);
    }

    this.scheduleNextPoll();
  }

  private scheduleNextPoll(): void {
    this.clearPollTimer();

    if (!this.isPollingActive || !this.isDocumentVisible()) {
      return;
    }

    this.pollTimer = setTimeout(() => {
      this.pollOnce();
    }, this.currentIntervalMs);
  }

  private clearPollTimer(): void {
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private isDocumentVisible(): boolean {
    if (typeof document === 'undefined') {
      return true;
    }
    return document.visibilityState !== 'hidden';
  }

  private setupVisibilityListener(): void {
    if (typeof document !== 'undefined' && !this.visibilityListener) {
      this.visibilityListener = () => {
        if (!this.isPollingActive) {
          return;
        }

        if (this.isDocumentVisible()) {
          // Tab became visible: poll immediately and reschedule
          this.pollOnce();
        } else {
          // Tab became hidden: pause timer to save network and battery
          this.clearPollTimer();
        }
      };

      document.addEventListener('visibilitychange', this.visibilityListener);
    }
  }

  private removeVisibilityListener(): void {
    if (typeof document !== 'undefined' && this.visibilityListener) {
      document.removeEventListener('visibilitychange', this.visibilityListener);
      this.visibilityListener = null;
    }
  }
}
