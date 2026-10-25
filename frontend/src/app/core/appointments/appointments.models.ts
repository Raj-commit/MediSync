export interface DoctorSummary {
  id: string;
  name: string;
  specialisations: string[];
  qualification: string;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface DoctorSearchResponse {
  doctors: DoctorSummary[];
  pagination: PaginationInfo;
}

export interface DoctorSearchParams {
  name?: string;
  specialisation?: string;
  page?: number;
  limit?: number;
}

export interface DoctorAvailabilitySlot {
  id: string;
  startTime: string;
  endTime: string;
  isBooked: boolean;
}

export interface DoctorAvailabilityResponse {
  doctor: {
    id: string;
    name: string;
  };
  slots: DoctorAvailabilitySlot[];
}

export interface BookAppointmentRequest {
  doctorId: string;
  slotId: string;
}

export interface BookedAppointment {
  id: string;
  doctor: {
    id: string;
    name: string;
  };
  dateTime: string;
  endTime: string;
  status: 'requested' | 'confirmed' | 'completed' | 'cancelled';
}

export type AppointmentStatus = 'requested' | 'confirmed' | 'completed' | 'cancelled';

export interface AppointmentItem {
  id: string;
  doctor?: {
    id: string;
    name: string;
  } | null;
  patient?: {
    id: string;
    name: string;
  } | null;
  dateTime: string;
  endTime: string;
  status: AppointmentStatus;
}

export interface AppointmentListResponse {
  appointments: AppointmentItem[];
  pagination: PaginationInfo;
}

export interface GetAppointmentsParams {
  status?: AppointmentStatus;
  when?: 'upcoming' | 'past';
  page?: number;
  limit?: number;
}

export type AppointmentAction = 'cancel' | 'reschedule' | 'accept' | 'reject' | 'complete';

export interface AppointmentActionRequest {
  action: AppointmentAction;
  slotId?: string;
}

export interface ManageAppointmentResponse {
  appointment: AppointmentItem;
}

export interface BookAppointmentResponse {
  appointment: BookedAppointment;
}

export interface ApiError {
  message: string;
  code?: string;
}
