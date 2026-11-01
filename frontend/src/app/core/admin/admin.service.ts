import { HttpClient, HttpParams } from '@angular/common/http';
import { effect, inject, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import {
  AdminPagination,
  AdminUser,
  AdminUsersListResponse,
  AdminUserUpdateResponse,
  GetAdminUsersParams,
} from './admin.models';

@Injectable({
  providedIn: 'root',
})
export class AdminUsersService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly baseUrl = `${environment.apiUrl}/admin/users`;

  readonly users = signal<AdminUser[]>([]);
  readonly pagination = signal<AdminPagination | null>(null);

  constructor() {
    // Automatically wipe in-memory administrative user records when admin logs out
    effect(() => {
      if (!this.auth.user()) {
        this.clearMemory();
      }
    });
  }

  /**
   * Fetches the list of patient and doctor accounts with optional filters and pagination.
   * Transmits only non-empty parameters. Updates in-memory signals on success.
   */
  getUsers(params?: GetAdminUsersParams): Observable<AdminUsersListResponse> {
    let httpParams = new HttpParams();

    if (params) {
      if (params.role) {
        httpParams = httpParams.set('role', params.role);
      }
      if (params.status) {
        httpParams = httpParams.set('status', params.status);
      }
      if (params.search && params.search.trim()) {
        httpParams = httpParams.set('search', params.search.trim());
      }
      if (params.page !== undefined && params.page > 0) {
        httpParams = httpParams.set('page', params.page.toString());
      }
      if (params.limit !== undefined && params.limit > 0) {
        httpParams = httpParams.set('limit', params.limit.toString());
      }
    }

    return this.http.get<AdminUsersListResponse>(this.baseUrl, { params: httpParams }).pipe(
      tap((res) => {
        this.users.set(res.users);
        this.pagination.set(res.pagination);
      }),
    );
  }

  /**
   * Activates or deactivates a user account via PATCH /api/v1/admin/users/:id.
   * Updates the target user in the in-memory users list upon successful confirmation.
   */
  updateUserStatus(id: string, isActive: boolean): Observable<AdminUserUpdateResponse> {
    return this.http.patch<AdminUserUpdateResponse>(`${this.baseUrl}/${id}`, { isActive }).pipe(
      tap((res) => {
        this.users.update((list) => list.map((u) => (u.id === id ? res.user : u)));
      }),
    );
  }

  /**
   * Resets all in-memory user lists and pagination to comply with NFR-08 privacy.
   */
  clearMemory(): void {
    this.users.set([]);
    this.pagination.set(null);
  }
}
