import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthUser, LoginRequest, LoginResponse, RegisterRequest, Role } from './auth.models';
import { isTokenExpired } from './jwt';

const TOKEN_KEY = 'medisync.token';
const USER_KEY = 'medisync.user';
const ROLES: Role[] = ['patient', 'doctor', 'admin'];

interface Session {
  token: string;
  user: AuthUser;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/auth`;
  private readonly session = signal<Session | null>(this.loadSession());

  readonly token = computed(() => this.session()?.token ?? null);
  readonly user = computed(() => this.session()?.user ?? null);
  readonly role = computed(() => this.user()?.role ?? null);
  readonly isLoggedIn = computed(() => this.session() !== null);

  register(request: RegisterRequest): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/register`, request);
  }

  login(request: LoginRequest): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${this.baseUrl}/login`, request)
      .pipe(tap((response) => this.startSession(response)));
  }

  logout(): void {
    this.session.set(null);
    this.removeFromStorage(TOKEN_KEY);
    this.removeFromStorage(USER_KEY);
  }

  private startSession({ token, user }: LoginResponse): void {
    this.session.set({ token, user });
    this.writeToStorage(TOKEN_KEY, token);
    this.writeToStorage(USER_KEY, JSON.stringify(user));
  }

  // Restores the session after a page reload. Anything old or damaged is dropped.
  private loadSession(): Session | null {
    const token = this.readFromStorage(TOKEN_KEY);
    const userJson = this.readFromStorage(USER_KEY);
    if (!token || !userJson) {
      return null;
    }

    try {
      const user = JSON.parse(userJson) as AuthUser;
      const valid = !isTokenExpired(token) && user && ROLES.includes(user.role);
      if (valid) {
        return { token, user };
      }
    } catch {
      // Fall through and clear the damaged data.
    }

    this.removeFromStorage(TOKEN_KEY);
    this.removeFromStorage(USER_KEY);
    return null;
  }

  // Storage can be blocked (private mode, browser settings), so never let it crash the app.
  private readFromStorage(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private writeToStorage(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // The session still works until the page is reloaded.
    }
  }

  private removeFromStorage(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing to clean up.
    }
  }
}
