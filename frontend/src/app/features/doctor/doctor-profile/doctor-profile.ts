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
  DoctorProfile as DoctorProfileData,
  UpdateDoctorProfileRequest,
} from '../../../core/profile/profile.models';
import { ProfileService } from '../../../core/profile/profile.service';

type DoctorFieldName = 'name' | 'phone' | 'specialisations' | 'qualification';

interface InitialDoctorValues {
  name: string;
  phone: string;
  specialisations: string[];
  qualification: string;
}

// 7 to 15 digits, with an optional leading + and spaces or dashes in between.
const PHONE_PATTERN = /^\+?[0-9][0-9\s-]{5,13}[0-9]$/;

function validateSpecialisations(control: AbstractControl<string>): ValidationErrors | null {
  const raw = control.value || '';
  const list = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (list.length === 0) {
    return { required: true };
  }
  if (list.length > 10) {
    return { maxItems: true };
  }
  if (list.some((item) => item.length > 100)) {
    return { itemLength: true };
  }
  return null;
}

@Component({
  selector: 'app-doctor-profile',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './doctor-profile.html',
  styleUrl: './doctor-profile.css',
})
export class DoctorProfile implements OnInit {
  private readonly profileService = inject(ProfileService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    email: [{ value: '', disabled: true }],
    phone: ['', [Validators.required, Validators.pattern(PHONE_PATTERN)]],
    specialisations: ['', [Validators.required, validateSpecialisations]],
    qualification: ['', [Validators.required, Validators.maxLength(200)]],
  });

  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly hasChanges = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly serverError = signal<string | null>(null);
  protected readonly successMessage = signal<string | null>(null);
  protected readonly profile = signal<DoctorProfileData | null>(null);

  private initialValues: InitialDoctorValues | null = null;

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.updateHasChanges();
    });
  }

  ngOnInit(): void {
    this.loadProfile();
  }

  protected hasError(name: DoctorFieldName, error: string): boolean {
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
        const user = response.user as DoctorProfileData;
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
        const updated = response.user as DoctorProfileData;
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
      specialisations: this.initialValues.specialisations.join(', '),
      qualification: this.initialValues.qualification,
    });
    this.serverError.set(null);
    this.successMessage.set(null);
    this.updateHasChanges();
  }

  private setInitialData(user: DoctorProfileData): void {
    const specs = user.specialisations || [];
    this.initialValues = {
      name: user.name ?? '',
      phone: user.phone ?? '',
      specialisations: [...specs],
      qualification: user.qualification ?? '',
    };

    this.form.reset({
      name: this.initialValues.name,
      email: user.email ?? '',
      phone: this.initialValues.phone,
      specialisations: this.initialValues.specialisations.join(', '),
      qualification: this.initialValues.qualification,
    });

    this.updateHasChanges();
  }

  private parseSpecialisations(value: string): string[] {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private areListsEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) {
      return false;
    }
    return a.every((val, index) => val === b[index]);
  }

  private updateHasChanges(): void {
    if (!this.initialValues) {
      this.hasChanges.set(false);
      return;
    }
    const raw = this.form.getRawValue();
    const currentSpecs = this.parseSpecialisations(raw.specialisations);

    const changed =
      raw.name.trim() !== this.initialValues.name ||
      raw.phone.trim() !== this.initialValues.phone ||
      !this.areListsEqual(currentSpecs, this.initialValues.specialisations) ||
      raw.qualification.trim() !== this.initialValues.qualification;

    this.hasChanges.set(changed);
  }

  private getDirtyUpdates(): UpdateDoctorProfileRequest {
    if (!this.initialValues) {
      return {};
    }
    const raw = this.form.getRawValue();
    const updates: UpdateDoctorProfileRequest = {};

    if (raw.name.trim() !== this.initialValues.name) {
      updates.name = raw.name.trim();
    }
    if (raw.phone.trim() !== this.initialValues.phone) {
      updates.phone = raw.phone.trim();
    }

    const currentSpecs = this.parseSpecialisations(raw.specialisations);
    if (!this.areListsEqual(currentSpecs, this.initialValues.specialisations)) {
      updates.specialisations = currentSpecs;
    }

    if (raw.qualification.trim() !== this.initialValues.qualification) {
      updates.qualification = raw.qualification.trim();
    }

    return updates;
  }
}
