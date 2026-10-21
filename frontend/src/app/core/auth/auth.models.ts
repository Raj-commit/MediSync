interface BaseRegistration {
  name: string;
  email: string;
  phone: string;
  password: string;
}

export interface PatientRegistration extends BaseRegistration {
  role: 'patient';
  dateOfBirth: string;
  address: string;
}

export interface DoctorRegistration extends BaseRegistration {
  role: 'doctor';
  specialisations: string[];
  qualification: string;
}

// Admins never self-register, so only patient and doctor are allowed here.
export type RegisterRequest = PatientRegistration | DoctorRegistration;

export type Role = 'patient' | 'doctor' | 'admin';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

// Login response agreed in PROGRESS.md: { token, user: { id, name, email, role } }
export interface LoginResponse {
  token: string;
  user: AuthUser;
}
