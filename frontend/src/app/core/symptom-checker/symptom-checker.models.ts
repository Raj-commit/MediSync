export const MIN_SYMPTOMS = 1;
export const MAX_SYMPTOMS = 10;
export const MAX_SYMPTOM_LENGTH = 100;

export const FALLBACK_DISCLAIMER =
  'MediSync AI Symptom Checker provides preliminary informational guidance only. ' +
  'It is not a medical diagnosis or treatment plan. Consult a qualified healthcare ' +
  'professional for medical advice. Seek emergency assistance for severe or life-threatening symptoms.';

export type UrgencyLevel = 'emergency' | 'urgent' | 'routine';

export interface AiAssessment {
  assessment: string;
  possibleConditions: string[];
  urgencyLevel: UrgencyLevel;
  suggestedSpecialisation: string;
  generalAdvice: string[];
  disclaimer: string;
}

export interface SymptomCheckResult {
  id: string;
  symptoms: string[];
  assessment: AiAssessment;
  checkedAt: string; // ISO date string
}

export interface SymptomCheckResponse {
  result: SymptomCheckResult;
}

export interface SymptomCheckPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface SymptomCheckHistoryResponse {
  results: SymptomCheckResult[];
  pagination: SymptomCheckPagination;
}

export interface CheckSymptomsPayload {
  symptoms: string[];
}
