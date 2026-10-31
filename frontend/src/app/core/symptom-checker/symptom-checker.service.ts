import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  CheckSymptomsPayload,
  SymptomCheckHistoryResponse,
  SymptomCheckResponse,
  SymptomCheckResult,
} from './symptom-checker.models';

@Injectable({
  providedIn: 'root',
})
export class SymptomCheckerService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/symptom-checks`;

  // Ephemeral in-memory signal for active assessment (cleared on exit / logout)
  readonly activeResult = signal<SymptomCheckResult | null>(null);

  /**
   * Submits patient symptoms to Express for preliminary AI assessment.
   * Transmits ONLY the symptoms list.
   */
  checkSymptoms(symptoms: string[]): Observable<SymptomCheckResponse> {
    const payload: CheckSymptomsPayload = {
      symptoms: symptoms.map((s) => s.trim()),
    };
    return this.http.post<SymptomCheckResponse>(this.baseUrl, payload);
  }

  /**
   * Fetches the authenticated patient's past symptom checks with pagination.
   */
  getHistory(page: number = 1, limit: number = 10): Observable<SymptomCheckHistoryResponse> {
    let params = new HttpParams();
    if (page > 0) {
      params = params.set('page', page.toString());
    }
    if (limit > 0) {
      params = params.set('limit', limit.toString());
    }

    return this.http.get<SymptomCheckHistoryResponse>(this.baseUrl, { params });
  }

  /**
   * Clears any ephemeral in-memory clinical data to comply with NFR-08 privacy.
   */
  clearMemory(): void {
    this.activeResult.set(null);
  }
}
