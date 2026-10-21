import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';

import { RegisterRequest } from '../../../core/auth/auth.models';
import { AuthService } from '../../../core/auth/auth.service';

type Role = 'patient' | 'doctor';
type FieldName =
  | 'name'
  | 'email'
  | 'phone'
  | 'password'
  | 'confirmPassword'
  | 'dateOfBirth'
  | 'address'
  | 'specialisations'
  | 'qualification';

// 7 to 15 digits, with an optional leading + and spaces or dashes in between.
const PHONE_PATTERN = /^\+?[0-9][0-9\s-]{5,13}[0-9]$/;

function todayAsIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function notInFuture(control: AbstractControl<string>): ValidationErrors | null {
  return control.value > todayAsIsoDate() ? { future: true } : null;
}

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return password === confirm ? null : { passwordMismatch: true };
}

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register.html',
  styleUrl: './register.css',
})
export class Register {
  private readonly auth = inject(AuthService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly form = this.fb.group(
    {
      role: this.fb.control<Role>('patient'),
      name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', [Validators.required, Validators.pattern(PHONE_PATTERN)]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required],
      // Patient only
      dateOfBirth: ['', [Validators.required, notInFuture]],
      address: ['', Validators.required],
      // Doctor only, specialisations are typed as a comma separated list
      specialisations: ['', [Validators.required, Validators.pattern(/[^,\s]/)]],
      qualification: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );

  protected readonly role = toSignal(this.form.controls.role.valueChanges, {
    initialValue: 'patient' as Role,
  });
  protected readonly maxBirthDate = todayAsIsoDate();
  protected readonly submitting = signal(false);
  protected readonly registered = signal(false);
  protected readonly serverError = signal<string | null>(null);

  constructor() {
    this.applyRole('patient');
    this.form.controls.role.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((role) => this.applyRole(role));
  }

  protected hasError(name: FieldName, error: string): boolean {
    const control = this.form.controls[name];
    return control.touched && control.hasError(error);
  }

  protected passwordsDiffer(): boolean {
    return this.form.controls.confirmPassword.touched && this.form.hasError('passwordMismatch');
  }

  protected onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.serverError.set(null);

    this.auth.register(this.buildRequest()).subscribe({
      next: () => {
        this.submitting.set(false);
        this.registered.set(true);
      },
      error: (error: HttpErrorResponse) => {
        this.submitting.set(false);
        this.serverError.set(
          error.status === 0
            ? 'Cannot reach the server. Please try again.'
            : (error.error?.message ?? 'Registration failed. Please try again.'),
        );
      },
    });
  }

  // Disabled controls are skipped by validation, so only the chosen role's fields count.
  private applyRole(role: Role): void {
    const { dateOfBirth, address, specialisations, qualification } = this.form.controls;
    const patientOnly = [dateOfBirth, address];
    const doctorOnly = [specialisations, qualification];
    const [enable, disable] =
      role === 'patient' ? [patientOnly, doctorOnly] : [doctorOnly, patientOnly];

    enable.forEach((control) => control.enable({ emitEvent: false }));
    disable.forEach((control) => control.disable({ emitEvent: false }));
  }

  private buildRequest(): RegisterRequest {
    const value = this.form.getRawValue();
    const base = {
      name: value.name.trim(),
      email: value.email.trim(),
      phone: value.phone.trim(),
      password: value.password,
    };

    if (value.role === 'patient') {
      return {
        ...base,
        role: 'patient',
        dateOfBirth: value.dateOfBirth,
        address: value.address.trim(),
      };
    }

    return {
      ...base,
      role: 'doctor',
      specialisations: value.specialisations
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      qualification: value.qualification.trim(),
    };
  }
}
