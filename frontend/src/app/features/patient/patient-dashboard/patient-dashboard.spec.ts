import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { fakeJwt } from '../../../core/auth/testing';
import { PatientDashboard } from './patient-dashboard';

describe('PatientDashboard', () => {
  afterEach(() => localStorage.clear());

  it('greets the logged-in patient and displays links to find a doctor, view records, prescriptions and profile', async () => {
    localStorage.setItem('medisync.token', fakeJwt(3600));
    localStorage.setItem(
      'medisync.user',
      JSON.stringify({ id: '1', name: 'Asha Patel', email: 'asha@example.com', role: 'patient' }),
    );
    await TestBed.configureTestingModule({
      imports: [PatientDashboard],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    const fixture = TestBed.createComponent(PatientDashboard);
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;

    expect(page.querySelector('h1')?.textContent).toContain('Patient dashboard');
    expect(page.textContent).toContain('Welcome, Asha Patel.');
    expect(page.querySelector('a[routerLink="/patient/doctors"]')).not.toBeNull();
    expect(page.querySelector('a[routerLink="/patient/records"]')).not.toBeNull();
    expect(page.querySelector('a[routerLink="/patient/prescriptions"]')).not.toBeNull();
    expect(page.querySelector('a[routerLink="/patient/profile"]')).not.toBeNull();
  });
});
