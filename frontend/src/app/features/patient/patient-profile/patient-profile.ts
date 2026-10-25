import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { PatientProfile as PatientProfileData } from '../../../core/profile/profile.models';
import { ProfileService } from '../../../core/profile/profile.service';

@Component({
  selector: 'app-patient-profile',
  imports: [RouterLink],
  templateUrl: './patient-profile.html',
  styleUrl: './patient-profile.css',
})
export class PatientProfile implements OnInit {
  private readonly profileService = inject(ProfileService);

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly profile = signal<PatientProfileData | null>(null);

  ngOnInit(): void {
    this.loadProfile();
  }

  protected loadProfile(): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    this.profileService.getProfile().subscribe({
      next: (response) => {
        this.loading.set(false);
        this.profile.set(response.user as PatientProfileData);
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        this.errorMessage.set(
          error.status === 0
            ? 'Cannot reach the server. Please try again.'
            : (error.error?.message ?? 'Failed to load profile.'),
        );
      },
    });
  }
}
