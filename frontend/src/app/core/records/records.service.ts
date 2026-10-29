import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  AddRecordEntryRequest,
  AddRecordEntryResponse,
  GetRecordsParams,
  MedicalRecordResponse,
} from './records.models';

export const PATIENT_ID_REGEX = /^[0-9a-fA-F]{24}$/;
export const DIAGNOSIS_MAX_LENGTH = 300;
export const NOTES_MAX_LENGTH = 3000;

@Injectable({
  providedIn: 'root',
})
export class RecordsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/records`;

  /**
   * Validates if a string is a valid 24-character hexadecimal MongoDB ObjectId.
   */
  isValidPatientId(patientId: string): boolean {
    return typeof patientId === 'string' && PATIENT_ID_REGEX.test(patientId.trim());
  }

  /**
   * Fetches the authenticated patient's own medical record.
   * Query params: page and limit (optional).
   */
  getOwnRecord(params?: GetRecordsParams): Observable<MedicalRecordResponse> {
    const httpParams = this.buildPaginationParams(params);
    return this.http.get<MedicalRecordResponse>(`${this.baseUrl}/me`, {
      params: httpParams,
    });
  }

  /**
   * Fetches the medical record of a patient for an authorized doctor.
   * Doctor must have a confirmed or completed appointment with this patient.
   */
  getPatientRecord(
    patientId: string,
    params?: GetRecordsParams,
  ): Observable<MedicalRecordResponse> {
    const trimmedId = patientId ? patientId.trim() : '';
    if (!this.isValidPatientId(trimmedId)) {
      return throwError(() => new Error('Invalid patient ID format'));
    }

    const httpParams = this.buildPaginationParams(params);
    return this.http.get<MedicalRecordResponse>(
      `${this.baseUrl}/patient/${encodeURIComponent(trimmedId)}`,
      { params: httpParams },
    );
  }

  /**
   * Appends a new medical record entry for a patient.
   * Doctor must have a confirmed or completed appointment with this patient.
   * Payload: diagnosis (1-300 chars), notes (1-3000 chars).
   */
  addEntry(
    patientId: string,
    payload: AddRecordEntryRequest,
  ): Observable<AddRecordEntryResponse> {
    const trimmedId = patientId ? patientId.trim() : '';
    if (!this.isValidPatientId(trimmedId)) {
      return throwError(() => new Error('Invalid patient ID format'));
    }

    const body: AddRecordEntryRequest = {
      diagnosis: payload.diagnosis.trim(),
      notes: payload.notes.trim(),
    };

    return this.http.post<AddRecordEntryResponse>(
      `${this.baseUrl}/patient/${encodeURIComponent(trimmedId)}/entries`,
      body,
    );
  }

  /**
   * Resets any in-memory state.
   * Medical data is never stored in persistent browser storage
   * and must be cleared when logging out or navigating away.
   */
  clear(): void {
    // Medical records are fetched per-view and not permanently held in service cache.
    // This hook ensures consistency with other MediSync services on account teardown.
  }

  private buildPaginationParams(params?: GetRecordsParams): HttpParams {
    let httpParams = new HttpParams();
    if (params) {
      if (params.page !== undefined && params.page > 0) {
        httpParams = httpParams.set('page', params.page.toString());
      }
      if (params.limit !== undefined && params.limit > 0) {
        httpParams = httpParams.set('limit', params.limit.toString());
      }
    }
    return httpParams;
  }
}
