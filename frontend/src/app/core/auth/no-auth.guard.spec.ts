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
import { noAuthGuard } from './no-auth.guard';
import { fakeJwt } from './testing';

function runNoAuth(loggedInAs: Role | null): string | true {
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
    noAuthGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
  );
  return result === true ? true : TestBed.inject(Router).serializeUrl(result as never);
}

describe('noAuthGuard', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('allows unauthenticated visitors through to guest pages', () => {
    expect(runNoAuth(null)).toBe(true);
  });

  it('redirects logged-in patient to /patient', () => {
    expect(runNoAuth('patient')).toBe('/patient');
  });

  it('redirects logged-in doctor to /doctor', () => {
    expect(runNoAuth('doctor')).toBe('/doctor');
  });

  it('redirects logged-in admin to /admin', () => {
    expect(runNoAuth('admin')).toBe('/admin');
  });
});
