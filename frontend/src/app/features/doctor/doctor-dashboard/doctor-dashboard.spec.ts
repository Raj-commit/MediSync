import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { fakeJwt } from '../../../core/auth/testing';
import { DoctorDashboard } from './doctor-dashboard';

describe('DoctorDashboard', () => {
  afterEach(() => localStorage.clear());

  it('greets the logged-in doctor', async () => {
    localStorage.setItem('medisync.token', fakeJwt(3600));
    localStorage.setItem(
      'medisync.user',
      JSON.stringify({ id: '1', name: 'Asha Patel', email: 'asha@example.com', role: 'doctor' }),
    );
    await TestBed.configureTestingModule({
      imports: [DoctorDashboard],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    const fixture = TestBed.createComponent(DoctorDashboard);
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;

    expect(page.querySelector('h1')?.textContent).toContain('Doctor dashboard');
    expect(page.textContent).toContain('Welcome, Asha Patel.');
    expect(page.querySelector('a[routerLink="/doctor/availability"]')).not.toBeNull();
  });
});
