import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { environment } from '../../../../environments/environment';
import { Register } from './register';

const REGISTER_URL = `${environment.apiUrl}/auth/register`;

describe('Register', () => {
  let fixture: ComponentFixture<Register>;
  let page: HTMLElement;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Register],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(Register);
    page = fixture.nativeElement as HTMLElement;
    http = TestBed.inject(HttpTestingController);
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  async function type(selector: string, value: string) {
    const field = page.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
    field.value = value;
    field.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  async function chooseRole(role: 'patient' | 'doctor') {
    page.querySelector<HTMLInputElement>(`input[value="${role}"]`)!.click();
    await fixture.whenStable();
  }

  async function submit() {
    page.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  }

  async function fillCommonFields() {
    await type('#name', '  Asha Patel ');
    await type('#email', 'asha@example.com');
    await type('#phone', '9876543210');
    await type('#password', 'password123');
    await type('#confirmPassword', 'password123');
  }

  it('shows the patient fields by default', () => {
    expect(page.querySelector('#dateOfBirth')).toBeTruthy();
    expect(page.querySelector('#address')).toBeTruthy();
    expect(page.querySelector('#specialisations')).toBeNull();
    expect(page.querySelector('#qualification')).toBeNull();
  });

  it('shows the doctor fields after choosing doctor', async () => {
    await chooseRole('doctor');

    expect(page.querySelector('#specialisations')).toBeTruthy();
    expect(page.querySelector('#qualification')).toBeTruthy();
    expect(page.querySelector('#dateOfBirth')).toBeNull();
    expect(page.querySelector('#address')).toBeNull();
  });

  it('shows required errors and sends nothing when the form is empty', async () => {
    await submit();

    const text = page.textContent;
    expect(text).toContain('Name is required.');
    expect(text).toContain('Email is required.');
    expect(text).toContain('Password is required.');
    expect(text).toContain('Date of birth is required.');
    http.expectNone(REGISTER_URL);
  });

  it('rejects a password shorter than 8 characters and mismatching passwords', async () => {
    await type('#password', 'short');
    await type('#confirmPassword', 'different');
    await submit();

    expect(page.textContent).toContain('Use at least 8 characters.');
    expect(page.textContent).toContain('Passwords do not match.');
    http.expectNone(REGISTER_URL);
  });

  it('rejects a date of birth in the future', async () => {
    await fillCommonFields();
    await type('#dateOfBirth', '2999-01-01');
    await type('#address', '12 Main Road');
    await submit();

    expect(page.textContent).toContain('Date of birth cannot be in the future.');
    http.expectNone(REGISTER_URL);
  });

  it('sends the patient registration and shows the success message', async () => {
    await fillCommonFields();
    await type('#dateOfBirth', '1999-04-12');
    await type('#address', ' 12 Main Road ');
    await submit();

    const call = http.expectOne(REGISTER_URL);
    expect(call.request.method).toBe('POST');
    expect(call.request.body).toEqual({
      role: 'patient',
      name: 'Asha Patel',
      email: 'asha@example.com',
      phone: '9876543210',
      password: 'password123',
      dateOfBirth: '1999-04-12',
      address: '12 Main Road',
    });
    call.flush({});
    await fixture.whenStable();

    expect(page.textContent).toContain('Account created');
  });

  it('sends the doctor registration with specialisations as a list', async () => {
    await chooseRole('doctor');
    await fillCommonFields();
    await type('#specialisations', 'Cardiology, Internal medicine ,');
    await type('#qualification', 'MBBS, MD');
    await submit();

    const call = http.expectOne(REGISTER_URL);
    expect(call.request.body).toEqual({
      role: 'doctor',
      name: 'Asha Patel',
      email: 'asha@example.com',
      phone: '9876543210',
      password: 'password123',
      specialisations: ['Cardiology', 'Internal medicine'],
      qualification: 'MBBS, MD',
    });
    call.flush({});
  });

  it('shows the server message when registration fails', async () => {
    await fillCommonFields();
    await type('#dateOfBirth', '1999-04-12');
    await type('#address', '12 Main Road');
    await submit();

    http
      .expectOne(REGISTER_URL)
      .flush(
        { message: 'Email already registered', code: 'EMAIL_TAKEN' },
        { status: 409, statusText: 'Conflict' },
      );
    await fixture.whenStable();

    expect(page.textContent).toContain('Email already registered');
    expect(page.textContent).not.toContain('Account created');
  });
});
