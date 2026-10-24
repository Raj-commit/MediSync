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

export interface BookAppointmentResponse {
  appointment: BookedAppointment;
}

export interface ApiError {
  message: string;
  code?: string;
}
