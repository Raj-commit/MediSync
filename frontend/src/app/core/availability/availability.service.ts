import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  AvailabilityResponse,
  UpdateAvailabilityRequest,
  UpdateSlotDto,
} from './availability.models';

@Injectable({
  providedIn: 'root',
})
export class AvailabilityService {
  private readonly http = inject(HttpClient);
  private readonly endpoint = `${environment.apiUrl}/doctors/me/availability`;

  /**
   * Fetches all future availability slots for the authenticated doctor,
   * including both open and booked slots.
   */
  getAvailability(): Observable<AvailabilityResponse> {
    return this.http.get<AvailabilityResponse>(this.endpoint);
  }

  /**
   * Replaces the doctor's open future slots with the provided array of slots.
   * Booked slots are preserved on the server and must not be included.
   */
  updateAvailability(slots: UpdateSlotDto[]): Observable<AvailabilityResponse> {
    const payload: UpdateAvailabilityRequest = { slots };
    return this.http.put<AvailabilityResponse>(this.endpoint, payload);
  }
}
