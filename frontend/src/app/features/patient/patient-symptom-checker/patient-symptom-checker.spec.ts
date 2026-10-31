import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  RouterStateSnapshot,
} from '@angular/router';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/auth/auth.service';
import { roleGuard } from '../../../core/auth/role.guard';
import { fakeJwt } from '../../../core/auth/testing';
import {
  FALLBACK_DISCLAIMER,
  SymptomCheckHistoryResponse,
  SymptomCheckResponse,
  SymptomCheckResult,
} from '../../../core/symptom-checker/symptom-checker.models';
import { SymptomCheckerService } from '../../../core/symptom-checker/symptom-checker.service';
import { PatientSymptomChecker } from './patient-symptom-checker';

const BASE_URL = `${environment.apiUrl}/symptom-checks`;

const MOCK_ROUTINE_RESULT: SymptomCheckResult = {
  id: '672400000000000000000001',
  symptoms: ['fever', 'dry cough'],
  assessment: {
    assessment: 'Symptoms consistent with common upper respiratory infection.',
    possibleConditions: ['Common Cold', 'Viral Pharyngitis'],
    urgencyLevel: 'routine',
    suggestedSpecialisation: 'General Physician',
    generalAdvice: ['Get plenty of rest.', 'Drink warm fluids.'],
    disclaimer: FALLBACK_DISCLAIMER,
  },
  checkedAt: '2026-10-31T20:00:00.000Z',
};

const MOCK_EMERGENCY_RESULT: SymptomCheckResult = {
  id: '672400000000000000000002',
  symptoms: ['crushing chest pain', 'shortness of breath'],
  assessment: {
    assessment:
      'EMERGENCY NOTICE: Symptoms suggest acute chest emergency requiring immediate attention.',
    possibleConditions: ['Acute Coronary Syndrome', 'Pulmonary Embolism'],
    urgencyLevel: 'emergency',
    suggestedSpecialisation: 'Cardiology',
    generalAdvice: ['Call emergency medical services immediately.'],
    disclaimer: FALLBACK_DISCLAIMER,
  },
  checkedAt: '2026-10-31T21:00:00.000Z',
};

const MOCK_HISTORY_RESPONSE: SymptomCheckHistoryResponse = {
  results: [MOCK_ROUTINE_RESULT],
  pagination: {
    page: 1,
    limit: 10,
    total: 1,
    totalPages: 1,
  },
};

describe('PatientSymptomChecker Component', () => {
  let fixture: ComponentFixture<PatientSymptomChecker>;
  let component: PatientSymptomChecker;
  let element: HTMLElement;
  let service: SymptomCheckerService;
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();

    await TestBed.configureTestingModule({
      imports: [PatientSymptomChecker],
      providers: [
        SymptomCheckerService,
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    service = TestBed.inject(SymptomCheckerService);
    httpTesting = TestBed.inject(HttpTestingController);

    fixture = TestBed.createComponent(PatientSymptomChecker);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    httpTesting.verify();
    localStorage.clear();
    sessionStorage.clear();
  });

  function completeInitialHistoryLoad(response: SymptomCheckHistoryResponse = MOCK_HISTORY_RESPONSE) {
    fixture.detectChanges();
    const req = httpTesting.expectOne(`${BASE_URL}?page=1&limit=10`);
    req.flush(response);
    fixture.detectChanges();
  }

  // 1. Adding symptoms with Add button
  it('1. adds symptoms with the Add button', () => {
    completeInitialHistoryLoad();

    component.symptomInput.setValue('headache');
    fixture.detectChanges();

    const addBtn = element.querySelector('.button-add') as HTMLButtonElement;
    addBtn.click();
    fixture.detectChanges();

    expect(component.symptoms()).toEqual(['headache']);
    expect(element.querySelector('.chips-list')?.textContent).toContain('headache');
  });

  // 2. Adding symptoms with Enter
  it('2. adds symptoms with Enter key', () => {
    completeInitialHistoryLoad();

    const input = element.querySelector('#symptom-input') as HTMLInputElement;
    input.value = 'sore throat';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    fixture.detectChanges();

    expect(component.symptoms()).toEqual(['sore throat']);
    expect(element.querySelector('.chips-list')?.textContent).toContain('sore throat');
  });

  // 3. Removing individual symptom chips
  it('3. removes individual symptom chips and updates counter', () => {
    completeInitialHistoryLoad();

    component.symptoms.set(['fever', 'cough']);
    fixture.detectChanges();

    const removeBtns = element.querySelectorAll<HTMLButtonElement>('.chip-remove');
    expect(removeBtns.length).toBe(2);

    removeBtns[0].click(); // remove fever
    fixture.detectChanges();

    expect(component.symptoms()).toEqual(['cough']);
    expect(element.querySelector('.chips-list')?.textContent).not.toContain('fever');
    expect(component.liveAnnouncement()).toContain('Removed symptom: "fever"');
  });

  // 4. Blank symptom rejection
  it('4. rejects blank or whitespace-only symptoms', () => {
    completeInitialHistoryLoad();

    component.symptomInput.setValue('   ');
    component.addSymptom();
    fixture.detectChanges();

    expect(component.symptoms().length).toBe(0);
    expect(component.inputError()).toBe('Please enter a symptom description.');
    expect(element.querySelector('.field-error')?.textContent).toContain(
      'Please enter a symptom description.',
    );
  });

  // 5. Character limit of 100
  it('5. enforces character limit of 100 on input', () => {
    completeInitialHistoryLoad();

    const longSymptom = 'a'.repeat(101);
    component.symptomInput.setValue(longSymptom);
    component.addSymptom();
    fixture.detectChanges();

    expect(component.symptoms().length).toBe(0);
    expect(component.inputError()).toContain('100 characters or fewer');
  });

  // 6. Maximum of 10 symptoms
  it('6. prevents adding more than 10 symptoms', () => {
    completeInitialHistoryLoad();

    for (let i = 1; i <= 10; i++) {
      component.symptoms.update((list) => [...list, `symptom-${i}`]);
    }
    fixture.detectChanges();

    expect(component.canAddMore()).toBe(false);

    component.symptomInput.setValue('symptom-11');
    component.addSymptom();
    fixture.detectChanges();

    expect(component.symptoms().length).toBe(10);
    expect(component.inputError()).toBe('You can add at most 10 symptoms.');
  });

  // 7. Duplicate prevention after normalisation
  it('7. prevents duplicate symptoms after case and whitespace normalisation', () => {
    completeInitialHistoryLoad();

    component.symptoms.set(['Chest Pain']);
    fixture.detectChanges();

    component.symptomInput.setValue('  chest   pain  ');
    component.addSymptom();
    fixture.detectChanges();

    expect(component.symptoms().length).toBe(1);
    expect(component.inputError()).toBe('This symptom has already been added.');
  });

  // 8. Successful assessment rendering
  it('8. renders successful assessment results (assessment, conditions, urgency, specialisation, advice, disclaimer)', () => {
    completeInitialHistoryLoad();

    component.symptoms.set(['fever', 'dry cough']);
    fixture.detectChanges();

    const checkBtn = element.querySelector('.submit-btn') as HTMLButtonElement;
    checkBtn.click();
    fixture.detectChanges();

    const req = httpTesting.expectOne(BASE_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ symptoms: ['fever', 'dry cough'] });

    req.flush({ result: MOCK_ROUTINE_RESULT });
    fixture.detectChanges();

    // Verify all assessment fields are rendered
    expect(element.querySelector('.result-heading')?.textContent).toContain('Preliminary Assessment');
    expect(element.querySelector('.assessment-text')?.textContent).toContain(
      'Symptoms consistent with common upper respiratory infection.',
    );
    expect(element.querySelector('.urgency-badge')?.textContent).toContain('Routine');
    expect(element.querySelector('.spec-name')?.textContent).toContain('General Physician');
    expect(element.querySelector('.conditions-list')?.textContent).toContain('Common Cold');
    expect(element.querySelector('.advice-list')?.textContent).toContain('Get plenty of rest.');

    // Mandatory disclaimer is prominently visible
    expect(element.querySelector('.mandatory-disclaimer-card')?.textContent).toContain(
      FALLBACK_DISCLAIMER,
    );

    // Find a doctor link
    const findDoctorLink = element.querySelector('.find-doctor-btn') as HTMLAnchorElement;
    expect(findDoctorLink).not.toBeNull();
    expect(findDoctorLink.getAttribute('href') || findDoctorLink.getAttribute('routerlink')).toBe(
      '/patient/doctors',
    );
  });

  // 9. Emergency result presentation
  it('9. displays emergency results with prominent alert banner at top and assertive announcement', () => {
    completeInitialHistoryLoad();

    component.symptoms.set(['crushing chest pain']);
    component.submitCheck();
    fixture.detectChanges();

    const req = httpTesting.expectOne(BASE_URL);
    req.flush({ result: MOCK_EMERGENCY_RESULT });
    fixture.detectChanges();

    // Emergency alert banner visible
    const emergencyBanner = element.querySelector('.emergency-alert-banner');
    expect(emergencyBanner).not.toBeNull();
    expect(emergencyBanner?.getAttribute('aria-live')).toBe('assertive');
    expect(emergencyBanner?.textContent).toContain('EMERGENCY NOTICE');
    expect(emergencyBanner?.textContent).toContain('call local emergency services');

    // Emergency urgency badge
    expect(element.querySelector('.badge-emergency')?.textContent).toContain('Emergency');
    expect(component.liveAnnouncement()).toContain('Emergency alert:');
  });

  // 10. API validation and service-unavailable errors
  it('10. displays server error messages safely and keeps patient entered symptoms', () => {
    completeInitialHistoryLoad();

    component.symptoms.set(['fever', 'cough']);
    component.submitCheck();
    fixture.detectChanges();

    const req = httpTesting.expectOne(BASE_URL);
    req.flush(
      { message: 'Symptom checker service is temporarily unavailable. Please try again later.', code: 'SYMPTOM_SERVICE_UNAVAILABLE' },
      { status: 502, statusText: 'Bad Gateway' },
    );
    fixture.detectChanges();

    // Error alert is displayed
    const errorBox = element.querySelector('.submission-error');
    expect(errorBox?.textContent).toContain('Symptom checker service is temporarily unavailable');

    // Symptoms are retained in list
    expect(component.symptoms()).toEqual(['fever', 'cough']);
    expect(element.querySelector('.chips-list')?.textContent).toContain('fever');
  });

  // 11. History loading and empty state
  it('11. displays empty state when patient has no past symptom checks', () => {
    completeInitialHistoryLoad({
      results: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
    });

    expect(element.querySelector('.empty-box')?.textContent).toContain('No checks yet');
  });

  // 12. History expansion and collapse
  it('12. toggles history card expansion with accessible aria-expanded attribute', () => {
    completeInitialHistoryLoad();

    const toggleBtn = element.querySelector('.expand-toggle-btn') as HTMLButtonElement;
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');
    expect(element.querySelector('.history-card-details')).toBeNull();

    toggleBtn.click();
    fixture.detectChanges();

    expect(toggleBtn.getAttribute('aria-expanded')).toBe('true');
    expect(element.querySelector('.history-card-details')?.textContent).toContain(
      'Symptoms consistent with common upper respiratory infection.',
    );

    toggleBtn.click();
    fixture.detectChanges();
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');
    expect(element.querySelector('.history-card-details')).toBeNull();
  });

  // 13. Disclaimer visibility while history cards are collapsed
  it('13. keeps mandatory disclaimer visible on history card even while collapsed', () => {
    completeInitialHistoryLoad();

    expect(component.isCardExpanded(MOCK_ROUTINE_RESULT.id)).toBe(false);
    const historyDisclaimer = element.querySelector('.history-card-disclaimer');
    expect(historyDisclaimer).not.toBeNull();
    expect(historyDisclaimer?.textContent).toContain('Disclaimer:');
    expect(historyDisclaimer?.textContent).toContain(FALLBACK_DISCLAIMER);
  });

  // 14. Start New Check resetting form and current result
  it('14. resets form and current assessment on Start New Check without wiping history', () => {
    completeInitialHistoryLoad();

    component.symptoms.set(['fever']);
    component.currentResult.set(MOCK_ROUTINE_RESULT);
    fixture.detectChanges();

    expect(element.querySelector('.result-card')).not.toBeNull();

    const resetBtn = element.querySelector('.reset-btn') as HTMLButtonElement;
    resetBtn.click();
    fixture.detectChanges();

    expect(component.symptoms()).toEqual([]);
    expect(component.currentResult()).toBeNull();
    expect(element.querySelector('.result-card')).toBeNull();
    // History is preserved
    expect(component.history().length).toBe(1);
    expect(element.querySelector('.history-card')).not.toBeNull();
  });

  // 15. Preventing duplicate submissions
  it('15. locks submit button and input while submission is in progress', () => {
    completeInitialHistoryLoad();

    component.symptoms.set(['fever']);
    component.submitting.set(true);
    fixture.detectChanges();

    const submitBtn = element.querySelector('.submit-btn') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
    expect(submitBtn.textContent).toContain('Checking symptoms...');
  });

  // 16. Patient route protection
  it('16. roleGuard permits patient and rejects doctor or unauthenticated visitor', () => {
    function checkGuard(role: 'patient' | 'doctor' | null): string | true {
      const auth = TestBed.inject(AuthService);
      (auth as unknown as { session: { set: (val: unknown) => void } }).session.set(
        role
          ? {
              token: fakeJwt(3600),
              user: { id: '1', name: 'User', email: 'u@example.com', role },
            }
          : null,
      );
      const result = TestBed.runInInjectionContext(() =>
        roleGuard('patient')({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
      );
      return result === true ? true : TestBed.inject(Router).serializeUrl(result as never);
    }

    expect(checkGuard(null)).toBe('/login');
    expect(checkGuard('doctor')).toBe('/doctor');
    expect(checkGuard('patient')).toBe(true);
  });

  // Privacy Rule Test: zero persistence in localStorage/sessionStorage
  it('complies with NFR-08 privacy: never stores symptoms or assessments in browser storage', () => {
    completeInitialHistoryLoad();

    component.symptoms.set(['fever', 'cough']);
    component.currentResult.set(MOCK_ROUTINE_RESULT);
    fixture.detectChanges();

    expect(localStorage.getItem('symptoms')).toBeNull();
    expect(sessionStorage.getItem('symptoms')).toBeNull();
    expect(localStorage.getItem('assessment')).toBeNull();
    expect(sessionStorage.getItem('assessment')).toBeNull();
  });
});
