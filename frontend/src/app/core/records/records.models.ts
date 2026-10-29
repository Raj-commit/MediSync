export interface RecordPatientSummary {
  id: string;
  name: string;
  age: number | null;
}

export interface RecordDoctorSummary {
  id: string;
  name: string;
}

export interface MedicalRecordEntry {
  id: string;
  diagnosis: string;
  notes: string;
  updatedAt: string;
  updatedBy: RecordDoctorSummary;
}

export interface RecordPaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface MedicalRecord {
  patient: RecordPatientSummary;
  entries: MedicalRecordEntry[];
  pagination: RecordPaginationInfo;
}

export interface MedicalRecordResponse {
  record: MedicalRecord;
}

export interface AddRecordEntryRequest {
  diagnosis: string;
  notes: string;
}

export interface AddRecordEntryResponse {
  entry: MedicalRecordEntry;
}

export interface GetRecordsParams {
  page?: number;
  limit?: number;
}
