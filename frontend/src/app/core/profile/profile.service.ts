import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { ProfileResponse, UpdateProfileRequest } from './profile.models';

@Injectable({
  providedIn: 'root',
})
export class ProfileService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly baseUrl = `${environment.apiUrl}/users/me`;

  getProfile(): Observable<ProfileResponse> {
    return this.http.get<ProfileResponse>(this.baseUrl);
  }

  updateProfile(updates: UpdateProfileRequest): Observable<ProfileResponse> {
    return this.http.put<ProfileResponse>(this.baseUrl, updates).pipe(
      tap((response) => {
        if (response?.user?.name) {
          this.auth.updateUser({ name: response.user.name });
        }
      }),
    );
  }
}
