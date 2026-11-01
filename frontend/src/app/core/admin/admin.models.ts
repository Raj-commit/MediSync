export type UserRole = 'patient' | 'doctor';
export type UserStatusFilter = 'all' | 'active' | 'inactive';
export type UserRoleFilter = 'all' | 'patient' | 'doctor';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  specialisations?: string[];
  qualification?: string;
}

export interface AdminPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AdminUsersListResponse {
  users: AdminUser[];
  pagination: AdminPagination;
}

export interface AdminUserUpdateResponse {
  user: AdminUser;
}

export interface GetAdminUsersParams {
  role?: 'patient' | 'doctor';
  status?: 'active' | 'inactive';
  search?: string;
  page?: number;
  limit?: number;
}
