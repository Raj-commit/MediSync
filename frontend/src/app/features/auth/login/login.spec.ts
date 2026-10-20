import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { environment } from '../../../../environments/environment';
import { Login } from './login';

const LOGIN_URL = `${environment.apiUrl}/auth/login`;

describe('Login', () => {
  let fixture: ComponentFixture<Login>;
  let page: HTMLElement;
  let http: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(Login);
    page = fixture.nativeElement as HTMLElement;
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  async function type(selector: string, value: string) {
    const field = page.querySelector<HTMLInputElement>(selector)!;
    field.value = value;
    field.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  async function submit() {
    page.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  }

  it('shows required errors and sends nothing when the form is empty', async () => {
    await submit();

    expect(page.textContent).toContain('Email is required.');
    expect(page.textContent).toContain('Password is required.');
    http.expectNone(LOGIN_URL);
  });

  it('rejects an invalid email address', async () => {
    await type('#email', 'not-an-email');
    await type('#password', 'password123');
    await submit();

    expect(page.textContent).toContain('Enter a valid email address.');
    http.expectNone(LOGIN_URL);
  });

  it('sends the credentials and goes to the home page on success', async () => {
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    await type('#email', ' asha@example.com ');
    await type('#password', 'password123');
    await submit();

    const call = http.expectOne(LOGIN_URL);
    expect(call.request.method).toBe('POST');
    expect(call.request.body).toEqual({ email: 'asha@example.com', password: 'password123' });
    call.flush({
      token: 'jwt-token',
      user: { id: '1', name: 'Asha Patel', email: 'asha@example.com', role: 'patient' },
    });

    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('disables the button while the request is running', async () => {
    await type('#email', 'asha@example.com');
    await type('#password', 'password123');
    await submit();

    const button = page.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(button.disabled).toBe(true);

    http.expectOne(LOGIN_URL).flush({ message: 'x' }, { status: 401, statusText: 'Unauthorized' });
  });

  it('shows the server message when the login is refused', async () => {
    await type('#email', 'asha@example.com');
    await type('#password', 'wrong-password');
    await submit();

    http
      .expectOne(LOGIN_URL)
      .flush(
        { message: 'Invalid email or password', code: 'INVALID_CREDENTIALS' },
        { status: 401, statusText: 'Unauthorized' },
      );
    await fixture.whenStable();

    expect(page.textContent).toContain('Invalid email or password');
  });

  it('shows a friendly message when the server cannot be reached', async () => {
    await type('#email', 'asha@example.com');
    await type('#password', 'password123');
    await submit();

    http.expectOne(LOGIN_URL).error(new ProgressEvent('error'));
    await fixture.whenStable();

    expect(page.textContent).toContain('Cannot reach the server.');
  });
});
