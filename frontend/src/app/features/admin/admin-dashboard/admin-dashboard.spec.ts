import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { fakeJwt } from '../../../core/auth/testing';
import { AdminDashboard } from './admin-dashboard';

describe('AdminDashboard', () => {
  afterEach(() => localStorage.clear());

  it('greets the logged-in admin', async () => {
    localStorage.setItem('medisync.token', fakeJwt(3600));
    localStorage.setItem(
      'medisync.user',
      JSON.stringify({ id: '1', name: 'Asha Patel', email: 'asha@example.com', role: 'admin' }),
    );
    await TestBed.configureTestingModule({
      imports: [AdminDashboard],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    const fixture = TestBed.createComponent(AdminDashboard);
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;

    expect(page.querySelector('h1')?.textContent).toContain('Admin dashboard');
    expect(page.textContent).toContain('Welcome, Asha Patel.');
  });
});
