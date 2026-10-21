import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Navbar } from './navbar';

async function setup(loggedIn: boolean) {
  await TestBed.configureTestingModule({
    imports: [Navbar],
    providers: [provideRouter([])],
  }).compileComponents();

  const fixture = TestBed.createComponent(Navbar);
  fixture.componentRef.setInput('isLoggedIn', loggedIn);
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
});
