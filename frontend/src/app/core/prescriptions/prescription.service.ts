import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  CreatePrescriptionPayload,
  CreatePrescriptionResponse,
  GetPrescriptionsParams,
  OBJECT_ID_REGEX,
  PrescriptionListResponse,
} from './prescription.models';

@Injectable({
  providedIn: 'root',
})
export class PrescriptionsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/prescriptions`;

  /**
   * Validates if a string is a valid 24-character hexadecimal MongoDB ObjectId.
   */
  isValidObjectId(id: string | null | undefined): boolean {
    return typeof id === 'string' && OBJECT_ID_REGEX.test(id.trim());
  }

  /**
   * Fetches prescriptions for the authenticated user (patients see own, doctors see issued).
   * Supports pagination (page, limit) and filtering by appointmentId.
   */
  getPrescriptions(params?: GetPrescriptionsParams): Observable<PrescriptionListResponse> {
    let httpParams = new HttpParams();

    if (params) {
      if (params.page !== undefined && params.page > 0) {
        httpParams = httpParams.set('page', params.page.toString());
      }
      if (params.limit !== undefined && params.limit > 0) {
        httpParams = httpParams.set('limit', params.limit.toString());
      }
      if (params.appointmentId !== undefined && params.appointmentId.trim() !== '') {
        httpParams = httpParams.set('appointmentId', params.appointmentId.trim());
      }
    }

    return this.http.get<PrescriptionListResponse>(this.baseUrl, { params: httpParams });
  }

  /**
   * Creates a digital prescription for a completed appointment (doctor only).
   */
  createPrescription(payload: CreatePrescriptionPayload): Observable<CreatePrescriptionResponse> {
    return this.http.post<CreatePrescriptionResponse>(this.baseUrl, payload);
  }

  /**
   * Downloads raw PDF binary bytes for a prescription.
   */
  downloadPrescriptionPdf(prescriptionId: string): Observable<Blob> {
    const trimmedId = prescriptionId ? prescriptionId.trim() : '';
    if (!this.isValidObjectId(trimmedId)) {
      return throwError(() => new Error('Invalid prescription ID format'));
    }

    return this.http.get(`${this.baseUrl}/${encodeURIComponent(trimmedId)}/pdf`, {
      responseType: 'blob',
    });
  }

  /**
   * Safely triggers a browser file download from a Blob.
   * Validates that the blob has the expected application/pdf content type,
   * creates an object URL, clicks a transient anchor, and revokes the URL in finally.
   */
  triggerBlobDownload(blob: Blob, filename = 'prescription.pdf'): void {
    if (!blob || !blob.type || !blob.type.toLowerCase().includes('application/pdf')) {
      throw new Error('Invalid file format received: expected application/pdf');
    }

    const objectUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.style.display = 'none';
    anchor.href = objectUrl;
    anchor.download = filename;

    try {
      document.body.appendChild(anchor);
      anchor.click();
    } finally {
      if (anchor.parentNode) {
        anchor.parentNode.removeChild(anchor);
      }
      window.URL.revokeObjectURL(objectUrl);
    }
  }
}
