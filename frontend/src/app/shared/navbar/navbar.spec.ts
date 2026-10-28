import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { Role } from '../../core/auth/auth.models';
import { Navbar } from './navbar';

async function setup(loggedIn: boolean, role: Role | null = null, unreadCount = 0) {
  await TestBed.configureTestingModule({
    imports: [Navbar],
    providers: [provideRouter([])],
  }).compileComponents();

  const fixture = TestBed.createComponent(Navbar);
  fixture.componentRef.setInput('isLoggedIn', loggedIn);
  fixture.componentRef.setInput('role', role);
  fixture.componentRef.setInput('unreadCount', unreadCount);
  await fixture.whenStable();
  return fixture;
}

describe('Navbar', () => {
  it('shows Login and Register when logged out', async () => {
    const fixture = await setup(false);
    const text = (fixture.nativeElement as HTMLElement).textContent;

    expect(text).toContain('Login');
    expect(text).toContain('Register');
    expect(text).not.toContain('Logout');
  });

  it('shows Logout when logged in and emits when it is clicked', async () => {
    const fixture = await setup(true);
    const element = fixture.nativeElement as HTMLElement;
    let clicks = 0;
    fixture.componentInstance.logout.subscribe(() => clicks++);

    element.querySelector('button')?.click();

    expect(clicks).toBe(1);
    expect(element.textContent).not.toContain('Login');
  });

  it('shows bell icon linking to /notifications for logged-in patient', async () => {
    const fixture = await setup(true, 'patient', 0);
    const element = fixture.nativeElement as HTMLElement;

    const bellLink = element.querySelector<HTMLAnchorElement>('.bell-link');
    expect(bellLink).toBeTruthy();
    expect(bellLink?.getAttribute('href')).toBe('/notifications');
    expect(bellLink?.getAttribute('aria-label')).toBe('Notifications');
    expect(element.querySelector('.badge-count')).toBeNull();
  });

  it('shows bell icon linking to /notifications for logged-in doctor', async () => {
    const fixture = await setup(true, 'doctor', 3);
    const element = fixture.nativeElement as HTMLElement;

    const bellLink = element.querySelector<HTMLAnchorElement>('.bell-link');
    expect(bellLink).toBeTruthy();
    expect(bellLink?.getAttribute('href')).toBe('/notifications');
    expect(bellLink?.getAttribute('aria-label')).toBe('Notifications, 3 unread');

    const badge = element.querySelector('.badge-count');
    expect(badge?.textContent?.trim()).toBe('3');
  });

  it('does not show bell icon for admin', async () => {
    const fixture = await setup(true, 'admin', 5);
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.bell-link')).toBeNull();
  });

  it('does not show bell icon when logged out', async () => {
    const fixture = await setup(false, null, 10);
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.bell-link')).toBeNull();
  });

  it('formats badge count as 99+ when unreadCount exceeds 99', async () => {
    const fixture = await setup(true, 'patient', 125);
    const element = fixture.nativeElement as HTMLElement;

    const badge = element.querySelector('.badge-count');
    expect(badge?.textContent?.trim()).toBe('99+');
    expect(element.querySelector('.bell-link')?.getAttribute('aria-label')).toBe(
      'Notifications, 125 unread',
    );
  });
});
