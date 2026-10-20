import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { App } from './app';
import { routes } from './app.routes';
import { fakeJwt } from './core/auth/testing';

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  afterEach(() => localStorage.clear());

  it('shows the navbar', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('app-navbar')).toBeTruthy();
  });

  it('shows the home page at /', async () => {
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/');
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('main h1')?.textContent).toContain(
      'MediSync',
    );
  });

  it('shows the not-found page for an unknown route', async () => {
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/does-not-exist');
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Page not found');
  });

  it('shows Login and Register while logged out', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const text = (fixture.nativeElement as HTMLElement).querySelector('app-navbar')!.textContent;

    expect(text).toContain('Login');
    expect(text).not.toContain('Logout');
  });

  it('logs out and goes to /login when Logout is clicked', async () => {
    localStorage.setItem('medisync.token', fakeJwt(3600));
    localStorage.setItem(
      'medisync.user',
      JSON.stringify({ id: '1', name: 'Asha', email: 'asha@example.com', role: 'patient' }),
    );
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/');
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;

    expect(page.querySelector('app-navbar')!.textContent).toContain('Logout');
    expect(page.querySelector('app-navbar')!.textContent).not.toContain('Register');

    page.querySelector<HTMLButtonElement>('app-navbar button')!.click();
    await fixture.whenStable();

    expect(localStorage.getItem('medisync.token')).toBeNull();
    expect(router.url).toBe('/login');
    expect(page.querySelector('app-navbar')!.textContent).toContain('Login');
  });
});
