export type NotificationType =
  | 'appointment_requested'
  | 'appointment_request_sent'
  | 'appointment_confirmed'
  | 'appointment_rejected'
  | 'appointment_cancelled'
  | 'appointment_rescheduled'
  | 'appointment_completed'
  | 'appointment_reminder';

export type NotificationStatus = 'unread' | 'read';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  message: string;
  status: NotificationStatus;
  appointment: string | null;
  createdAt: string;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface NotificationListResponse {
  notifications: NotificationItem[];
  pagination: PaginationInfo;
  unreadCount: number;
}

export interface MarkAsReadResponse {
  notification: NotificationItem;
}

export interface GetNotificationsParams {
  status?: NotificationStatus;
  page?: number;
  limit?: number;
}

export interface ApiError {
  message: string;
  code?: string;
}
