import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import {
  CreatePrescriptionPayload,
  DOSAGE_MAX_LENGTH,
  INSTRUCTIONS_MAX_LENGTH,
  MAX_PRESCRIPTION_ITEMS,
  MEDICINE_MAX_LENGTH,
  MIN_PRESCRIPTION_ITEMS,
  Prescription,
  PrescriptionItem,
} from '../../../core/prescriptions/prescription.models';
import { PrescriptionsService } from '../../../core/prescriptions/prescription.service';

function trimmedRequired(control: AbstractControl<string>): ValidationErrors | null {
  const value = control.value;
  if (!value || typeof value !== 'string' || value.trim() === '') {
    return { required: true };
  }
  return null;
}

export type PrescriptionItemForm = FormGroup<{
  medicine: FormControl<string>;
  dosage: FormControl<string>;
  instructions: FormControl<string>;
}>;

@Component({
  selector: 'app-doctor-prescription',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './doctor-prescription.html',
  styleUrl: './doctor-prescription.css',
})
export class DoctorPrescription implements OnInit, OnDestroy {
  protected readonly route = inject(ActivatedRoute);
  protected readonly prescriptionsService = inject(PrescriptionsService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly appointmentId = signal<string>('');
  readonly isValidId = signal<boolean>(true);
  readonly loading = signal<boolean>(true);
  readonly pageError = signal<string | null>(null);

  readonly existingPrescription = signal<Prescription | null>(null);

  // Form submission and modal state
  readonly submitting = signal<boolean>(false);
  readonly submitError = signal<string | null>(null);
  readonly submitNotice = signal<string | null>(null);
  readonly showConfirmModal = signal<boolean>(false);

  // PDF download state
  readonly downloadingPdf = signal<boolean>(false);
  readonly pdfError = signal<string | null>(null);

  // Reactive Form
  readonly form = this.fb.group({
    items: this.fb.array<PrescriptionItemForm>([]),
  });

  readonly medicineMaxLen = MEDICINE_MAX_LENGTH;
  readonly dosageMaxLen = DOSAGE_MAX_LENGTH;
  readonly instructionsMaxLen = INSTRUCTIONS_MAX_LENGTH;
  readonly maxItems = MAX_PRESCRIPTION_ITEMS;
  readonly minItems = MIN_PRESCRIPTION_ITEMS;

  get items(): FormArray<PrescriptionItemForm> {
    return this.form.controls.items;
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.appointmentId.set(id);

    // Validate 24-character hexadecimal appointment ID before any network request
    if (!this.prescriptionsService.isValidObjectId(id)) {
      this.isValidId.set(false);
      this.loading.set(false);
      this.pageError.set(
        'Invalid appointment ID format. It must be a 24-character hexadecimal identifier.',
      );
      return;
    }

    // Initialize with one medicine item row
    this.addItem();
    this.checkExistingPrescription(id);
  }

  ngOnDestroy(): void {
    // Medical privacy: immediately clear in-memory sensitive data
    this.existingPrescription.set(null);
    this.showConfirmModal.set(false);
    this.submitError.set(null);
    this.submitNotice.set(null);
    this.pdfError.set(null);
  }

  createItemFormGroup(): PrescriptionItemForm {
    return this.fb.group({
      medicine: ['', [trimmedRequired, Validators.maxLength(MEDICINE_MAX_LENGTH)]],
      dosage: ['', [trimmedRequired, Validators.maxLength(DOSAGE_MAX_LENGTH)]],
      instructions: ['', [trimmedRequired, Validators.maxLength(INSTRUCTIONS_MAX_LENGTH)]],
    });
  }

  addItem(): void {
    if (this.items.length < MAX_PRESCRIPTION_ITEMS) {
      this.items.push(this.createItemFormGroup());
    }
  }

  removeItem(index: number): void {
    if (this.items.length > MIN_PRESCRIPTION_ITEMS) {
      this.items.removeAt(index);
    }
  }

  checkExistingPrescription(appointmentId: string): void {
    this.loading.set(true);
    this.pageError.set(null);

    this.prescriptionsService.getPrescriptions({ appointmentId }).subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res.prescriptions && res.prescriptions.length > 0) {
          this.existingPrescription.set(res.prescriptions[0]);
        }
      },
      error: (err) => {
        this.loading.set(false);
        if (err.status === 0) {
          this.pageError.set('Cannot reach the server. Please check your connection.');
        } else {
          this.pageError.set(err.error?.message || 'Failed to check appointment prescriptions.');
        }
      },
    });
  }

  openConfirmModal(): void {
    this.submitError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.showConfirmModal.set(true);
  }

  closeConfirmModal(): void {
    if (!this.submitting()) {
      this.showConfirmModal.set(false);
    }
  }

  confirmCreatePrescription(): void {
    if (this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.submitError.set(null);
    this.submitNotice.set(null);

    const rawItems: PrescriptionItem[] = this.items.controls.map((ctrl) => ({
      medicine: ctrl.controls.medicine.value.trim(),
      dosage: ctrl.controls.dosage.value.trim(),
      instructions: ctrl.controls.instructions.value.trim(),
    }));

    const payload: CreatePrescriptionPayload = {
      appointmentId: this.appointmentId(),
      items: rawItems,
    };

    this.prescriptionsService.createPrescription(payload).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.showConfirmModal.set(false);
        this.existingPrescription.set(res.prescription);

        if (res.prescription.pdfStatus === 'pending') {
          this.submitNotice.set(
            'Prescription saved, but PDF generation is currently unavailable. You can retry downloading it.',
          );
        } else {
          this.submitNotice.set('Prescription issued successfully.');
        }
      },
      error: (err) => {
        this.submitting.set(false);

        // 409 PRESCRIPTION_EXISTS: seamless recovery to view existing prescription
        if (err.status === 409) {
          this.showConfirmModal.set(false);
          this.submitNotice.set('A prescription has already been issued for this appointment.');
          this.checkExistingPrescription(this.appointmentId());
          return;
        }

        if (err.status === 0) {
          this.submitError.set('Cannot reach the server. Please try again.');
        } else {
          this.submitError.set(err.error?.message || 'Failed to issue prescription.');
        }
      },
    });
  }

  downloadPdf(): void {
    const rx = this.existingPrescription();
    if (!rx || this.downloadingPdf()) {
      return;
    }

    this.downloadingPdf.set(true);
    this.pdfError.set(null);

    this.prescriptionsService.downloadPrescriptionPdf(rx.id).subscribe({
      next: (blob: Blob) => {
        this.downloadingPdf.set(false);
        // If it was pending, successful download proves it is now ready
        if (rx.pdfStatus === 'pending') {
          this.existingPrescription.update((curr) =>
            curr ? { ...curr, pdfStatus: 'ready' } : curr,
          );
        }

        try {
          this.prescriptionsService.triggerBlobDownload(blob, `prescription_${rx.id}.pdf`);
        } catch (err: unknown) {
          this.pdfError.set(
            err instanceof Error ? err.message : 'Failed to download prescription PDF.',
          );
        }
      },
      error: (err) => {
        this.downloadingPdf.set(false);
        if (err.status === 0) {
          this.pdfError.set('Cannot reach the server. Please check your connection.');
        } else if (err.status === 502) {
          this.pdfError.set(
            'Prescription saved, but PDF generation is currently unavailable. You can retry downloading it.',
          );
        } else {
          this.pdfError.set(err.error?.message || 'Failed to download prescription PDF.');
        }
      },
    });
  }

  formatDate(dateString: string): string {
    if (!dateString) return '';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
}
