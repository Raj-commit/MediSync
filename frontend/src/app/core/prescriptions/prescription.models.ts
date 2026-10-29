export const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;
export const MEDICINE_MAX_LENGTH = 200;
export const DOSAGE_MAX_LENGTH = 200;
export const INSTRUCTIONS_MAX_LENGTH = 500;
export const MAX_PRESCRIPTION_ITEMS = 50;
export const MIN_PRESCRIPTION_ITEMS = 1;

export interface PrescriptionItem {
  medicine: string;
  dosage: string;
  instructions: string;
}

export interface PrescriptionPatient {
  id: string;
  name: string;
}

export interface PrescriptionDoctor {
  id: string;
  name: string;
}

export interface Prescription {
  id: string;
  appointment: string;
  patient: PrescriptionPatient;
  doctor: PrescriptionDoctor;
  issuedDate: string; // YYYY-MM-DD
  items: PrescriptionItem[];
  pdfUrl: string;
  pdfStatus: 'ready' | 'pending' | 'failed' | string;
  createdAt: string;
}

export interface PrescriptionPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PrescriptionListResponse {
  prescriptions: Prescription[];
  pagination: PrescriptionPagination;
}

export interface CreatePrescriptionPayload {
  appointmentId: string;
  items: PrescriptionItem[];
}

export interface CreatePrescriptionResponse {
  prescription: Prescription;
}

export interface GetPrescriptionsParams {
  page?: number;
  limit?: number;
  appointmentId?: string;
}
