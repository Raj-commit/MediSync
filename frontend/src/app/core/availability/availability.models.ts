export interface AvailabilitySlot {
  id: string;
  startTime: string; // ISO 8601 UTC string (e.g. 2026-11-02T04:30:00.000Z)
  endTime: string; // ISO 8601 UTC string (e.g. 2026-11-02T05:00:00.000Z)
  isBooked: boolean;
}

export interface AvailabilityResponse {
  slots: AvailabilitySlot[];
}

export interface UpdateSlotDto {
  startTime: string; // ISO 8601 UTC string
  endTime: string; // ISO 8601 UTC string
}

export interface UpdateAvailabilityRequest {
  slots: UpdateSlotDto[];
}
