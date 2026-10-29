// frontend/src/app/core/video/video.service.spec.ts
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { VideoStatusResponse } from './video.models';
import { VideoService } from './video.service';

describe('VideoService', () => {
  let service: VideoService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        VideoService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(VideoService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('fetches video consultation status from GET /appointments/:id/video', () => {
    const mockResponse: VideoStatusResponse = {
      canJoin: true,
      reason: null,
      appointment: {
        id: 'appt-123',
        status: 'confirmed',
        dateTime: '2026-10-29T10:00:00.000Z',
        endTime: '2026-10-29T10:30:00.000Z',
        otherParty: {
          id: 'doc-456',
          name: 'Dr. Jane Smith',
          role: 'doctor',
        },
      },
      session: null,
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
      ],
    };

    service.getVideoStatus('appt-123').subscribe((res) => {
      expect(res).toEqual(mockResponse);
    });

    const req = http.expectOne(`${environment.apiUrl}/appointments/appt-123/video`);
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  describe('isWithinCallWindow', () => {
    const startIso = '2026-10-29T10:00:00.000Z';
    const endIso = '2026-10-29T10:30:00.000Z';

    it('returns true when current time is 5 minutes before start', () => {
      const now = new Date('2026-10-29T09:55:00.000Z');
      expect(service.isWithinCallWindow(startIso, endIso, now)).toBe(true);
    });

    it('returns true when current time is during appointment', () => {
      const now = new Date('2026-10-29T10:15:00.000Z');
      expect(service.isWithinCallWindow(startIso, endIso, now)).toBe(true);
    });

    it('returns true when current time is 30 minutes after appointment end', () => {
      const now = new Date('2026-10-29T11:00:00.000Z');
      expect(service.isWithinCallWindow(startIso, endIso, now)).toBe(true);
    });

    it('returns false when current time is 11 minutes before start', () => {
      const now = new Date('2026-10-29T09:49:00.000Z');
      expect(service.isWithinCallWindow(startIso, endIso, now)).toBe(false);
    });

    it('returns false when current time is 61 minutes after end', () => {
      const now = new Date('2026-10-29T11:31:00.000Z');
      expect(service.isWithinCallWindow(startIso, endIso, now)).toBe(false);
    });
  });
});
