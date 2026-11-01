import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { fakeJwt } from '../../../core/auth/testing';
import { AdminDashboard } from './admin-dashboard';

describe('AdminDashboard', () => {
  afterEach(() => localStorage.clear());

  it('greets the logged-in admin and links to user management', async () => {
    localStorage.setItem('medisync.token', fakeJwt(3600));
    localStorage.setItem(
      'medisync.user',
      JSON.stringify({ id: '1', name: 'Asha Patel', email: 'asha@example.com', role: 'admin' }),
    );
    await TestBed.configureTestingModule({
      imports: [AdminDashboard],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(AdminDashboard);
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;

    expect(page.querySelector('h1')?.textContent).toContain('Admin dashboard');
    expect(page.textContent).toContain('Welcome, Asha Patel.');
    const link = page.querySelector('a[href="/admin/users"]');
    expect(link).toBeTruthy();
    expect(link?.textContent).toContain('Manage patient and doctor accounts');
  });
});
