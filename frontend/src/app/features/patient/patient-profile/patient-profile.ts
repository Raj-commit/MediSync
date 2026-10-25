import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';

import {
  PatientProfile as PatientProfileData,
  UpdatePatientProfileRequest,
} from '../../../core/profile/profile.models';
import { ProfileService } from '../../../core/profile/profile.service';

type PatientFieldName = 'name' | 'phone' | 'dateOfBirth' | 'address';

interface InitialPatientValues {
  name: string;
  phone: string;
  dateOfBirth: string;
  address: string;
}

// 7 to 15 digits, with an optional leading + and spaces or dashes in between.
const PHONE_PATTERN = /^\+?[0-9][0-9\s-]{5,13}[0-9]$/;

function todayAsIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function notInFuture(control: AbstractControl<string>): ValidationErrors | null {
  return control.value && control.value > todayAsIsoDate() ? { future: true } : null;
}

@Component({
  selector: 'app-patient-profile',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './patient-profile.html',
  styleUrl: './patient-profile.css',
})
export class PatientProfile implements OnInit {
  private readonly profileService = inject(ProfileService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    email: [{ value: '', disabled: true }],
    phone: ['', [Validators.required, Validators.pattern(PHONE_PATTERN)]],
    dateOfBirth: ['', [Validators.required, notInFuture]],
    address: ['', [Validators.required, Validators.maxLength(300)]],
  });

  protected readonly maxBirthDate = todayAsIsoDate();
  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly hasChanges = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly serverError = signal<string | null>(null);
  protected readonly successMessage = signal<string | null>(null);
  protected readonly profile = signal<PatientProfileData | null>(null);

  private initialValues: InitialPatientValues | null = null;

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.updateHasChanges();
    });
  }

  ngOnInit(): void {
    this.loadProfile();
  }

  protected hasError(name: PatientFieldName, error: string): boolean {
    const control = this.form.controls[name];
    return control.touched && control.hasError(error);
  }

  protected loadProfile(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.serverError.set(null);
    this.successMessage.set(null);

    this.profileService.getProfile().subscribe({
      next: (response) => {
        const user = response.user as PatientProfileData;
        this.loading.set(false);
        this.profile.set(user);
        this.setInitialData(user);
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        this.loadError.set(
          error.status === 0
            ? 'Cannot reach the server. Please try again.'
            : (error.error?.message ?? 'Failed to load profile.'),
        );
      },
    });
  }

  protected onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const updates = this.getDirtyUpdates();
    if (Object.keys(updates).length === 0) {
      return;
    }

    this.submitting.set(true);
    this.serverError.set(null);
    this.successMessage.set(null);

    this.profileService.updateProfile(updates).subscribe({
      next: (response) => {
        const updated = response.user as PatientProfileData;
        this.submitting.set(false);
        this.profile.set(updated);
        this.setInitialData(updated);
        this.successMessage.set('Profile updated successfully.');
      },
      error: (error: HttpErrorResponse) => {
        this.submitting.set(false);
        this.serverError.set(
          error.status === 0
            ? 'Cannot reach the server. Please try again.'
            : (error.error?.message ?? 'Failed to update profile. Please try again.'),
        );
      },
    });
  }

  protected onReset(): void {
    if (!this.initialValues) {
      return;
    }
    this.form.patchValue({
      name: this.initialValues.name,
      phone: this.initialValues.phone,
      dateOfBirth: this.initialValues.dateOfBirth,
      address: this.initialValues.address,
    });
    this.serverError.set(null);
    this.successMessage.set(null);
    this.updateHasChanges();
  }

  private setInitialData(user: PatientProfileData): void {
    this.initialValues = {
      name: user.name ?? '',
      phone: user.phone ?? '',
      dateOfBirth: user.dateOfBirth ?? '',
      address: user.address ?? '',
    };

    this.form.reset({
      name: this.initialValues.name,
      email: user.email ?? '',
      phone: this.initialValues.phone,
      dateOfBirth: this.initialValues.dateOfBirth,
      address: this.initialValues.address,
    });

    this.updateHasChanges();
  }

  private updateHasChanges(): void {
    if (!this.initialValues) {
      this.hasChanges.set(false);
      return;
    }
    const raw = this.form.getRawValue();
    const changed =
      raw.name.trim() !== this.initialValues.name ||
      raw.phone.trim() !== this.initialValues.phone ||
      raw.dateOfBirth !== this.initialValues.dateOfBirth ||
      raw.address.trim() !== this.initialValues.address;
    this.hasChanges.set(changed);
  }

  private getDirtyUpdates(): UpdatePatientProfileRequest {
    if (!this.initialValues) {
      return {};
    }
    const raw = this.form.getRawValue();
    const updates: UpdatePatientProfileRequest = {};

    if (raw.name.trim() !== this.initialValues.name) {
      updates.name = raw.name.trim();
    }
    if (raw.phone.trim() !== this.initialValues.phone) {
      updates.phone = raw.phone.trim();
    }
    if (raw.dateOfBirth !== this.initialValues.dateOfBirth) {
      updates.dateOfBirth = raw.dateOfBirth;
    }
    if (raw.address.trim() !== this.initialValues.address) {
      updates.address = raw.address.trim();
    }

    return updates;
  }
}
