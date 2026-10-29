// frontend/src/app/core/video/video.service.ts
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { VideoStatusResponse } from './video.models';

const CALL_WINDOW_BEFORE_MINUTES = 10;
const CALL_WINDOW_AFTER_MINUTES = 60;

@Injectable({
  providedIn: 'root',
})
export class VideoService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  /**
   * Fetches the video consultation eligibility, appointment details, session info,
   * and authorized ICE servers for an appointment.
   */
  getVideoStatus(appointmentId: string): Observable<VideoStatusResponse> {
    return this.http.get<VideoStatusResponse>(
      `${this.baseUrl}/appointments/${appointmentId}/video`,
    );
  }

  /**
   * Helper to check whether the current time is within the allowed call window:
   * from 10 minutes before `dateTime` until 60 minutes after `endTime`.
   */
  isWithinCallWindow(
    dateTimeIso: string,
    endTimeIso: string,
    now: Date = new Date(),
  ): boolean {
    const start = new Date(dateTimeIso).getTime() - CALL_WINDOW_BEFORE_MINUTES * 60 * 1000;
    const end = new Date(endTimeIso).getTime() + CALL_WINDOW_AFTER_MINUTES * 60 * 1000;
    const current = now.getTime();
    return current >= start && current <= end;
  }
}
