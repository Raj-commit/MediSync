import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../../environments/environment';
import {
  FALLBACK_DISCLAIMER,
  SymptomCheckHistoryResponse,
  SymptomCheckResponse,
} from './symptom-checker.models';
import { SymptomCheckerService } from './symptom-checker.service';

const BASE_URL = `${environment.apiUrl}/symptom-checks`;

const MOCK_CHECK_RESPONSE: SymptomCheckResponse = {
  result: {
    id: '672400000000000000000001',
    symptoms: ['fever', 'dry cough'],
    assessment: {
      assessment: 'Symptoms commonly associated with viral upper respiratory conditions.',
      possibleConditions: ['Common Cold', 'Viral Pharyngitis'],
      urgencyLevel: 'routine',
      suggestedSpecialisation: 'General Physician',
      generalAdvice: ['Get adequate rest.', 'Stay hydrated.'],
      disclaimer: FALLBACK_DISCLAIMER,
    },
    checkedAt: '2026-10-31T22:30:00.000Z',
  },
};

const MOCK_HISTORY_RESPONSE: SymptomCheckHistoryResponse = {
  results: [MOCK_CHECK_RESPONSE.result],
  pagination: {
    page: 1,
    limit: 10,
    total: 1,
    totalPages: 1,
  },
};

describe('SymptomCheckerService', () => {
  let service: SymptomCheckerService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SymptomCheckerService, provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(SymptomCheckerService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('posts symptoms to /api/v1/symptom-checks with exact payload', () => {
    let result: SymptomCheckResponse | undefined;

    service.checkSymptoms(['  fever ', 'dry cough']).subscribe((res) => {
      result = res;
    });

    const req = httpTesting.expectOne(BASE_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      symptoms: ['fever', 'dry cough'],
    });

    req.flush(MOCK_CHECK_RESPONSE);
    expect(result).toEqual(MOCK_CHECK_RESPONSE);
  });

  it('gets patient history with pagination parameters', () => {
    let historyResult: SymptomCheckHistoryResponse | undefined;

    service.getHistory(2, 5).subscribe((res) => {
      historyResult = res;
    });

    const req = httpTesting.expectOne(`${BASE_URL}?page=2&limit=5`);
    expect(req.request.method).toBe('GET');

    req.flush(MOCK_HISTORY_RESPONSE);
    expect(historyResult).toEqual(MOCK_HISTORY_RESPONSE);
  });

  it('clears in-memory activeResult signal on clearMemory() without touching browser storage', () => {
    service.activeResult.set(MOCK_CHECK_RESPONSE.result);
    expect(service.activeResult()).toEqual(MOCK_CHECK_RESPONSE.result);

    service.clearMemory();
    expect(service.activeResult()).toBeNull();

    expect(localStorage.getItem('symptoms')).toBeNull();
    expect(sessionStorage.getItem('symptoms')).toBeNull();
  });
});
