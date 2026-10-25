import { Role } from '../auth/auth.models';

export interface BaseProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
}

export interface PatientProfile extends BaseProfile {
  role: 'patient';
  dateOfBirth: string | null;
  address: string;
}

export interface DoctorProfile extends BaseProfile {
  role: 'doctor';
  specialisations: string[];
  qualification: string;
}

export type UserProfile = PatientProfile | DoctorProfile;

export interface ProfileResponse {
  user: UserProfile;
}

export interface PatientProfileResponse {
  user: PatientProfile;
}

export interface DoctorProfileResponse {
  user: DoctorProfile;
}

export interface UpdatePatientProfileRequest {
  name?: string;
  phone?: string;
  dateOfBirth?: string;
  address?: string;
}

export interface UpdateDoctorProfileRequest {
  name?: string;
  phone?: string;
  specialisations?: string[];
  qualification?: string;
}

export type UpdateProfileRequest = UpdatePatientProfileRequest | UpdateDoctorProfileRequest;
