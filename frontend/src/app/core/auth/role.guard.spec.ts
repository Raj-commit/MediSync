import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  RouterStateSnapshot,
} from '@angular/router';

import { Role } from './auth.models';
import { dashboardPathFor } from './dashboard-path';
import { roleGuard } from './role.guard';
import { fakeJwt } from './testing';

function run(guardRoles: Role[], loggedInAs: Role | null): string | true {
  if (loggedInAs) {
    localStorage.setItem('medisync.token', fakeJwt(3600));
    localStorage.setItem(
      'medisync.user',
      JSON.stringify({ id: '1', name: 'Test', email: 'test@example.com', role: loggedInAs }),
    );
  }
  TestBed.configureTestingModule({
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
  });

  const result = TestBed.runInInjectionContext(() =>
    roleGuard(...guardRoles)({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
  );
  return result === true ? true : TestBed.inject(Router).serializeUrl(result as never);
}

describe('roleGuard', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('sends a logged-out visitor to /login', () => {
    expect(run(['patient'], null)).toBe('/login');
  });

  it('lets a user with the right role in', () => {
    expect(run(['doctor'], 'doctor')).toBe(true);
  });

  it('sends a patient away from a doctor page to the patient dashboard', () => {
    expect(run(['doctor'], 'patient')).toBe('/patient');
  });

  it('sends a doctor away from an admin page to the doctor dashboard', () => {
    expect(run(['admin'], 'doctor')).toBe('/doctor');
  });

  it('accepts any of several allowed roles', () => {
    expect(run(['doctor', 'admin'], 'admin')).toBe(true);
  });
});

describe('dashboardPathFor', () => {
  it('gives each role its own dashboard', () => {
    expect(dashboardPathFor('patient')).toBe('/patient');
    expect(dashboardPathFor('doctor')).toBe('/doctor');
    expect(dashboardPathFor('admin')).toBe('/admin');
  });
});
