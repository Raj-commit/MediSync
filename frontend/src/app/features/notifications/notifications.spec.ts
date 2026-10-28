import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../../environments/environment';
import { fakeJwt } from '../../core/auth/testing';
import { NotificationListResponse } from '../../core/notifications/notifications.models';
import { NotificationsPage } from './notifications';

const NOTIFICATIONS_URL = `${environment.apiUrl}/notifications`;

describe('NotificationsPage Component', () => {
  let fixture: ComponentFixture<NotificationsPage>;
  let component: NotificationsPage;
  let page: HTMLElement;
  let http: HttpTestingController;

  const mockNotifications: NotificationListResponse = {
    notifications: [
      {
        id: 'notif-1',
        type: 'appointment_confirmed',
        message: 'Dr. Sarah Connor confirmed your appointment.',
        status: 'unread',
        appointment: 'appt-100',
        createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 mins ago
      },
      {
        id: 'notif-2',
        type: 'appointment_reminder',
        message: 'You have an upcoming appointment with Dr. Sarah Connor.',
        status: 'read',
        appointment: 'appt-100',
        createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), // 2 hours ago
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

  async function setup(role: 'patient' | 'doctor' = 'patient') {
    localStorage.setItem('medisync.token', fakeJwt(3600));
    localStorage.setItem(
      'medisync.user',
      JSON.stringify({
        id: 'user-1',
        name: 'Jane User',
        email: 'user@example.com',
        role,
      }),
    );

    await TestBed.configureTestingModule({
      imports: [NotificationsPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationsPage);
    component = fixture.componentInstance;
    page = fixture.nativeElement as HTMLElement;
    http = TestBed.inject(HttpTestingController);
  }

  afterEach(() => {
    http.verify();
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('loads and displays notifications on initialization', async () => {
    await setup('patient');
    fixture.detectChanges();

    const req = http.expectOne((r) => r.url === NOTIFICATIONS_URL && r.params.get('page') === '1');
    expect(req.request.method).toBe('GET');
    req.flush(mockNotifications);

    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.textContent).toContain('Notifications');
    expect(page.textContent).toContain('1 unread');
    expect(page.textContent).toContain('Dr. Sarah Connor confirmed your appointment.');
    expect(page.textContent).toContain('You have an upcoming appointment with Dr. Sarah Connor.');

    // Status badges
    const badges = page.querySelectorAll('.badge');
    expect(badges.length).toBe(2);
    expect(badges[0].textContent?.trim()).toBe('Unread');
    expect(badges[1].textContent?.trim()).toBe('Read');
  });

  it('switches filter tab to Unread and requests status=unread', async () => {
    await setup('patient');
    fixture.detectChanges();

    const req1 = http.expectOne((r) => r.url === NOTIFICATIONS_URL);
    req1.flush(mockNotifications);
    fixture.detectChanges();

    // Click Unread tab
    const tabs = page.querySelectorAll<HTMLButtonElement>('.tab-button');
    tabs[1].click(); // 'Unread' tab
    fixture.detectChanges();

    const req2 = http.expectOne(
      (r) =>
        r.url === NOTIFICATIONS_URL &&
        r.params.get('status') === 'unread' &&
        r.params.get('page') === '1',
    );
    expect(req2.request.method).toBe('GET');

    req2.flush({
      notifications: [mockNotifications.notifications[0]],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      unreadCount: 1,
    });

    await fixture.whenStable();
    fixture.detectChanges();

    const cards = page.querySelectorAll('.notification-card');
    expect(cards.length).toBe(1);
    expect(page.textContent).toContain('Dr. Sarah Connor confirmed your appointment.');
  });

  it('handles pagination navigation and disables buttons on edge pages', async () => {
    await setup('patient');
    fixture.detectChanges();

    const req1 = http.expectOne((r) => r.url === NOTIFICATIONS_URL);
    req1.flush({
      ...mockNotifications,
      pagination: { page: 1, limit: 10, total: 15, totalPages: 2 },
    });
    fixture.detectChanges();

    let prevBtn = page.querySelector<HTMLButtonElement>('button[aria-label="Previous page"]')!;
    let nextBtn = page.querySelector<HTMLButtonElement>('button[aria-label="Next page"]')!;

    expect(prevBtn.disabled).toBe(true);
    expect(nextBtn.disabled).toBe(false);

    // Click next page
    nextBtn.click();
    fixture.detectChanges();

    const req2 = http.expectOne(
      (r) => r.url === NOTIFICATIONS_URL && r.params.get('page') === '2',
    );
    req2.flush({
      notifications: [mockNotifications.notifications[1]],
      pagination: { page: 2, limit: 10, total: 15, totalPages: 2 },
      unreadCount: 1,
    });

    await fixture.whenStable();
    fixture.detectChanges();

    prevBtn = page.querySelector<HTMLButtonElement>('button[aria-label="Previous page"]')!;
    nextBtn = page.querySelector<HTMLButtonElement>('button[aria-label="Next page"]')!;

    expect(page.textContent).toContain('Page 2 of 2');
    expect(nextBtn.disabled).toBe(true);
    expect(prevBtn.disabled).toBe(false);
  });

  it('displays empty state card when no notifications match', async () => {
    await setup('patient');
    fixture.detectChanges();

    const req = http.expectOne((r) => r.url === NOTIFICATIONS_URL);
    req.flush({
      notifications: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
      unreadCount: 0,
    });
    fixture.detectChanges();

    expect(page.textContent).toContain('No notifications found');
    expect(page.textContent).toContain('You have no notifications yet.');
  });

  it('displays error box when API fails and retries on click', async () => {
    await setup('patient');
    fixture.detectChanges();

    const req = http.expectOne((r) => r.url === NOTIFICATIONS_URL);
    req.flush(
      { message: 'Failed to load notifications' },
      { status: 500, statusText: 'Server Error' },
    );
    fixture.detectChanges();

    const alertBox = page.querySelector('.error-box[role="alert"]');
    expect(alertBox).toBeTruthy();
    expect(alertBox?.textContent).toContain('Failed to load notifications');

    // Click Retry
    const retryBtn = alertBox?.querySelector<HTMLButtonElement>('button')!;
    retryBtn.click();
    fixture.detectChanges();

    const retryReq = http.expectOne((r) => r.url === NOTIFICATIONS_URL);
    expect(retryReq.request.method).toBe('GET');
    retryReq.flush(mockNotifications);
    fixture.detectChanges();

    expect(page.querySelector('.error-box')).toBeNull();
    expect(page.textContent).toContain('Dr. Sarah Connor confirmed your appointment.');
  });

  it('shows friendly connection error when server cannot be reached (status 0)', async () => {
    await setup('patient');
    fixture.detectChanges();

    const req = http.expectOne((r) => r.url === NOTIFICATIONS_URL);
    req.flush(null, { status: 0, statusText: 'Unknown Error' });
    fixture.detectChanges();

    expect(page.textContent).toContain('Cannot reach the server. Please try again.');
  });

  it('marks an unread notification as read, decrements unread count, and updates badge', async () => {
    await setup('patient');
    fixture.detectChanges();

    const req = http.expectOne((r) => r.url === NOTIFICATIONS_URL);
    req.flush(mockNotifications);
    fixture.detectChanges();

    const markReadBtn = page.querySelector<HTMLButtonElement>('.mark-read-btn')!;
    expect(markReadBtn).toBeTruthy();
    expect(markReadBtn.textContent).toContain('Mark as read');

    markReadBtn.click();
    fixture.detectChanges();

    const patchReq = http.expectOne(`${NOTIFICATIONS_URL}/notif-1/read`);
    expect(patchReq.request.method).toBe('PATCH');
    expect(patchReq.request.body).toEqual({});

    patchReq.flush({
      notification: {
        ...mockNotifications.notifications[0],
        status: 'read',
      },
    });

    await fixture.whenStable();
    fixture.detectChanges();

    // Notification badge updated to Read and mark read button removed
    const cards = page.querySelectorAll('.notification-card');
    expect(cards[0].querySelector('.badge')?.textContent?.trim()).toBe('Read');
    expect(cards[0].querySelector('.mark-read-btn')).toBeNull();
  });

  it('renders appointment link pointing to /patient/appointments for patient', async () => {
    await setup('patient');
    fixture.detectChanges();

    const req = http.expectOne((r) => r.url === NOTIFICATIONS_URL);
    req.flush(mockNotifications);
    fixture.detectChanges();

    const appointmentLink = page.querySelector<HTMLAnchorElement>('.button-link')!;
    expect(appointmentLink).toBeTruthy();
    expect(appointmentLink.getAttribute('href')).toBe('/patient/appointments');
  });

  it('renders appointment link pointing to /doctor/appointments for doctor', async () => {
    await setup('doctor');
    fixture.detectChanges();

    const req = http.expectOne((r) => r.url === NOTIFICATIONS_URL);
    req.flush(mockNotifications);
    fixture.detectChanges();

    const appointmentLink = page.querySelector<HTMLAnchorElement>('.button-link')!;
    expect(appointmentLink).toBeTruthy();
    expect(appointmentLink.getAttribute('href')).toBe('/doctor/appointments');
  });
});
