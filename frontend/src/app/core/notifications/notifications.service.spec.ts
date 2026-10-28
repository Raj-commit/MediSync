import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { environment } from '../../../environments/environment';
import {
  MarkAsReadResponse,
  NotificationListResponse,
} from './notifications.models';
import {
  DEFAULT_POLL_INTERVAL_MS,
  MAX_POLL_INTERVAL_MS,
  NotificationsService,
} from './notifications.service';

const NOTIFICATIONS_URL = `${environment.apiUrl}/notifications`;

const MOCK_LIST_RESPONSE: NotificationListResponse = {
  notifications: [
    {
      id: 'notif-1',
      type: 'appointment_confirmed',
      message: 'Dr. Sarah Connor confirmed your appointment.',
      status: 'unread',
      appointment: 'appt-100',
      createdAt: '2026-10-28T10:00:00.000Z',
    },
    {
      id: 'notif-2',
      type: 'appointment_reminder',
      message: 'You have an upcoming appointment with Dr. Sarah Connor.',
      status: 'read',
      appointment: 'appt-100',
      createdAt: '2026-10-28T09:00:00.000Z',
    },
  ],
  pagination: {
    page: 1,
    limit: 10,
    total: 2,
    totalPages: 1,
  },
  unreadCount: 1,
};

describe('NotificationsService', () => {
  let service: NotificationsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(NotificationsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    if (service) {
      service.clear();
    }
    if (http) {
      http.verify();
    }
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  describe('getNotifications', () => {
    it('sends GET to /notifications with no query params when params are omitted and updates unreadCount', () => {
      let actual: NotificationListResponse | undefined;

      service.getNotifications().subscribe((res) => {
        actual = res;
      });

      const req = http.expectOne(NOTIFICATIONS_URL);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.keys().length).toBe(0);
      req.flush(MOCK_LIST_RESPONSE);

      expect(actual).toEqual(MOCK_LIST_RESPONSE);
      expect(service.unreadCount()).toBe(1);
    });

    it('sends valid status, page, and limit query parameters', () => {
      service
        .getNotifications({
          status: 'unread',
          page: 2,
          limit: 15,
        })
        .subscribe();

      const req = http.expectOne(
        (request) =>
          request.url === NOTIFICATIONS_URL &&
          request.params.get('status') === 'unread' &&
          request.params.get('page') === '2' &&
          request.params.get('limit') === '15',
      );
      expect(req.request.method).toBe('GET');
      req.flush(MOCK_LIST_RESPONSE);
    });

    it('omits undefined or non-positive page and limit parameters', () => {
      service
        .getNotifications({
          page: 0,
          limit: -5,
        })
        .subscribe();

      const req = http.expectOne(NOTIFICATIONS_URL);
      expect(req.request.params.keys().length).toBe(0);
      req.flush(MOCK_LIST_RESPONSE);
    });

    it('propagates error when GET /notifications fails', () => {
      let errorStatus: number | undefined;

      service.getNotifications().subscribe({
        next: () => {
          throw new Error('should have failed');
        },
        error: (err) => {
          errorStatus = err.status;
        },
      });

      const req = http.expectOne(NOTIFICATIONS_URL);
      req.flush({ message: 'Server error', code: 'SERVER_ERROR' }, { status: 500, statusText: 'Server Error' });

      expect(errorStatus).toBe(500);
    });
  });

  describe('refreshUnreadCount', () => {
    it('requests /notifications with limit=1 and extracts unreadCount', () => {
      let actualCount: number | undefined;

      service.refreshUnreadCount().subscribe((count) => {
        actualCount = count;
      });

      const req = http.expectOne(`${NOTIFICATIONS_URL}?limit=1`);
      expect(req.request.method).toBe('GET');
      req.flush({
        notifications: [MOCK_LIST_RESPONSE.notifications[0]],
        pagination: { page: 1, limit: 1, total: 2, totalPages: 2 },
        unreadCount: 4,
      });

      expect(actualCount).toBe(4);
      expect(service.unreadCount()).toBe(4);
    });
  });

  describe('markAsRead', () => {
    it('sends PATCH to /notifications/:id/read with empty body and decrements unreadCount', () => {
      service.setUnreadCount(3);
      const notifId = 'notif-123';
      const mockResponse: MarkAsReadResponse = {
        notification: {
          id: notifId,
          type: 'appointment_confirmed',
          message: 'Confirmed',
          status: 'read',
          appointment: null,
          createdAt: '2026-10-28T10:00:00.000Z',
        },
      };

      let actual: MarkAsReadResponse | undefined;
      service.markAsRead(notifId).subscribe((res) => {
        actual = res;
      });

      const req = http.expectOne(`${NOTIFICATIONS_URL}/${notifId}/read`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({});
      req.flush(mockResponse);

      expect(actual).toEqual(mockResponse);
      expect(service.unreadCount()).toBe(2);
    });

    it('does not decrement unreadCount below zero', () => {
      service.setUnreadCount(0);
      const notifId = 'notif-999';

      service.markAsRead(notifId).subscribe();

      const req = http.expectOne(`${NOTIFICATIONS_URL}/${notifId}/read`);
      req.flush({
        notification: {
          id: notifId,
          type: 'appointment_confirmed',
          message: 'Confirmed',
          status: 'read',
          appointment: null,
          createdAt: '2026-10-28T10:00:00.000Z',
        },
      });

      expect(service.unreadCount()).toBe(0);
    });
  });

  describe('setUnreadCount, decrementUnreadCount, clear', () => {
    it('updates unread count with floor at 0', () => {
      service.setUnreadCount(5);
      expect(service.unreadCount()).toBe(5);

      service.setUnreadCount(-3);
      expect(service.unreadCount()).toBe(0);

      service.setUnreadCount(1);
      service.decrementUnreadCount();
      expect(service.unreadCount()).toBe(0);

      service.decrementUnreadCount();
      expect(service.unreadCount()).toBe(0);
    });

    it('resets state on clear()', () => {
      service.setUnreadCount(10);
      service.clear();

      expect(service.unreadCount()).toBe(0);
      expect(service.isPolling()).toBe(false);
      expect(service.getCurrentIntervalMs()).toBe(DEFAULT_POLL_INTERVAL_MS);
    });
  });

  describe('polling & freshness', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('starts polling with immediate request and schedules next poll at 30 seconds', () => {
      service.startPolling();
      expect(service.isPolling()).toBe(true);

      // Initial immediate fetch
      const req1 = http.expectOne(`${NOTIFICATIONS_URL}?limit=1`);
      req1.flush({
        notifications: [],
        pagination: { page: 1, limit: 1, total: 0, totalPages: 0 },
        unreadCount: 3,
      });
      expect(service.unreadCount()).toBe(3);

      // Advance by 30 seconds
      vi.advanceTimersByTime(DEFAULT_POLL_INTERVAL_MS);

      const req2 = http.expectOne(`${NOTIFICATIONS_URL}?limit=1`);
      req2.flush({
        notifications: [],
        pagination: { page: 1, limit: 1, total: 0, totalPages: 0 },
        unreadCount: 5,
      });
      expect(service.unreadCount()).toBe(5);
    });

    it('doubles polling interval on 5xx server error up to MAX_POLL_INTERVAL_MS', () => {
      service.startPolling();

      // Initial request
      const req1 = http.expectOne(`${NOTIFICATIONS_URL}?limit=1`);
      req1.flush({}, { status: 500, statusText: 'Server Error' });

      // First error backoff: 30s * 2 = 60s
      expect(service.getCurrentIntervalMs()).toBe(60_000);

      vi.advanceTimersByTime(60_000);
      const req2 = http.expectOne(`${NOTIFICATIONS_URL}?limit=1`);
      req2.flush({}, { status: 503, statusText: 'Service Unavailable' });

      // Second error backoff: 60s * 2 = 120s (MAX)
      expect(service.getCurrentIntervalMs()).toBe(MAX_POLL_INTERVAL_MS);

      vi.advanceTimersByTime(MAX_POLL_INTERVAL_MS);
      const req3 = http.expectOne(`${NOTIFICATIONS_URL}?limit=1`);
      req3.flush({}, { status: 0, statusText: 'Network Error' });

      // Still capped at 120s
      expect(service.getCurrentIntervalMs()).toBe(MAX_POLL_INTERVAL_MS);

      // On next successful poll, interval resets to DEFAULT_POLL_INTERVAL_MS (30s)
      vi.advanceTimersByTime(MAX_POLL_INTERVAL_MS);
      const req4 = http.expectOne(`${NOTIFICATIONS_URL}?limit=1`);
      req4.flush({
        notifications: [],
        pagination: { page: 1, limit: 1, total: 0, totalPages: 0 },
        unreadCount: 2,
      });

      expect(service.getCurrentIntervalMs()).toBe(DEFAULT_POLL_INTERVAL_MS);
      expect(service.unreadCount()).toBe(2);
    });

    it('stops polling and clears state immediately on 401/403 authentication error', () => {
      service.startPolling();

      const req = http.expectOne(`${NOTIFICATIONS_URL}?limit=1`);
      req.flush(
        { message: 'Invalid or expired token', code: 'INVALID_TOKEN' },
        { status: 401, statusText: 'Unauthorized' },
      );

      expect(service.isPolling()).toBe(false);
      expect(service.unreadCount()).toBe(0);
    });

    it('pauses timer when tab becomes hidden and immediately polls when tab becomes visible', () => {
      service.startPolling();

      const req1 = http.expectOne(`${NOTIFICATIONS_URL}?limit=1`);
      req1.flush({
        notifications: [],
        pagination: { page: 1, limit: 1, total: 0, totalPages: 0 },
        unreadCount: 1,
      });

      // Simulate tab hidden
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));

      // Advancing timer while hidden should NOT trigger a request
      vi.advanceTimersByTime(60_000);
      http.expectNone(`${NOTIFICATIONS_URL}?limit=1`);

      // Simulate tab becomes visible again
      Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));

      // Immediate request triggered upon visibility
      const req2 = http.expectOne(`${NOTIFICATIONS_URL}?limit=1`);
      req2.flush({
        notifications: [],
        pagination: { page: 1, limit: 1, total: 0, totalPages: 0 },
        unreadCount: 3,
      });
      expect(service.unreadCount()).toBe(3);
    });

    it('stops polling cleanly when stopPolling() is called', () => {
      service.startPolling();

      const req1 = http.expectOne(`${NOTIFICATIONS_URL}?limit=1`);
      req1.flush({
        notifications: [],
        pagination: { page: 1, limit: 1, total: 0, totalPages: 0 },
        unreadCount: 0,
      });

      service.stopPolling();
      expect(service.isPolling()).toBe(false);

      vi.advanceTimersByTime(60_000);
      http.expectNone(`${NOTIFICATIONS_URL}?limit=1`);
    });
  });
});
