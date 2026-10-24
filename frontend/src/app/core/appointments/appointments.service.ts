import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  BookAppointmentRequest,
  BookAppointmentResponse,
  DoctorAvailabilityResponse,
  DoctorSearchParams,
  DoctorSearchResponse,
} from './appointments.models';

@Injectable({
  providedIn: 'root',
})
export class AppointmentsService {
  private readonly http = inject(HttpClient);
  private readonly doctorsUrl = `${environment.apiUrl}/doctors`;
  private readonly appointmentsUrl = `${environment.apiUrl}/appointments`;

  /**
   * Searches active doctors by name and/or specialisation with pagination.
   * Only allowed non-empty query keys ('name', 'specialisation', 'page', 'limit') are sent.
   */
  searchDoctors(params?: DoctorSearchParams): Observable<DoctorSearchResponse> {
    let httpParams = new HttpParams();

    if (params) {
      if (params.name !== undefined && params.name.trim() !== '') {
        httpParams = httpParams.set('name', params.name.trim());
      }
      if (params.specialisation !== undefined && params.specialisation.trim() !== '') {
        httpParams = httpParams.set('specialisation', params.specialisation.trim());
      }
      if (params.page !== undefined && params.page > 0) {
        httpParams = httpParams.set('page', params.page.toString());
      }
      if (params.limit !== undefined && params.limit > 0) {
        httpParams = httpParams.set('limit', params.limit.toString());
      }
    }

    return this.http.get<DoctorSearchResponse>(this.doctorsUrl, { params: httpParams });
  }

  /**
   * Fetches open future availability slots for a doctor.
   */
  getDoctorAvailability(doctorId: string): Observable<DoctorAvailabilityResponse> {
    return this.http.get<DoctorAvailabilityResponse>(
      `${this.doctorsUrl}/${encodeURIComponent(doctorId)}/availability`,
    );
  }

  /**
   * Books an appointment for the authenticated patient with the specified slot.
   */
  bookAppointment(payload: BookAppointmentRequest): Observable<BookAppointmentResponse> {
    return this.http.post<BookAppointmentResponse>(this.appointmentsUrl, payload);
  }
}
