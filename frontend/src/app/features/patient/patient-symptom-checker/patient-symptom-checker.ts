import {
  Component,
  computed,
  ElementRef,
  inject,
  OnDestroy,
  signal,
  ViewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import {
  MAX_SYMPTOM_LENGTH,
  MAX_SYMPTOMS,
  MIN_SYMPTOMS,
} from '../../../core/symptom-checker/symptom-checker.models';
import { SymptomCheckerService } from '../../../core/symptom-checker/symptom-checker.service';

@Component({
  selector: 'app-patient-symptom-checker',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './patient-symptom-checker.html',
  styleUrl: './patient-symptom-checker.css',
})
export class PatientSymptomChecker implements OnDestroy {
  protected readonly symptomCheckerService = inject(SymptomCheckerService);
  private readonly fb = inject(NonNullableFormBuilder);

  @ViewChild('symptomInputRef') symptomInputRef?: ElementRef<HTMLInputElement>;

  // Form input control
  readonly symptomInput = this.fb.control('');

  // Reactive signal derived from form control valueChanges
  readonly inputValue = toSignal(this.symptomInput.valueChanges, { initialValue: '' });

  // Added symptoms state
  readonly symptoms = signal<string[]>([]);
  readonly inputError = signal<string | null>(null);
  readonly liveAnnouncement = signal<string>('');

  // Limits & counters
  readonly maxSymptoms = MAX_SYMPTOMS;
  readonly maxSymptomLength = MAX_SYMPTOM_LENGTH;
  readonly minSymptoms = MIN_SYMPTOMS;

  readonly currentInputLength = computed(() => (this.inputValue() || '').length);
  readonly totalSymptomsCount = computed(() => this.symptoms().length);
  readonly canAddMore = computed(() => this.symptoms().length < MAX_SYMPTOMS);
  readonly canSubmit = computed(() => this.symptoms().length >= MIN_SYMPTOMS);

  ngOnDestroy(): void {
    this.symptoms.set([]);
    this.symptomCheckerService.clearMemory();
  }

  /**
   * Adds the current input value as a symptom chip.
   * Validates non-blank, length, max count, and prevents case-insensitive duplicates.
   */
  addSymptom(): void {
    const raw = this.symptomInput.value;
    const trimmed = raw.trim();

    if (!trimmed) {
      this.inputError.set('Please enter a symptom description.');
      return;
    }

    if (trimmed.length > MAX_SYMPTOM_LENGTH) {
      this.inputError.set(`Each symptom must be ${MAX_SYMPTOM_LENGTH} characters or fewer.`);
      return;
    }

    if (this.symptoms().length >= MAX_SYMPTOMS) {
      this.inputError.set(`You can add at most ${MAX_SYMPTOMS} symptoms.`);
      return;
    }

    // Normalise whitespace and lowercase for duplicate check
    const normalizedNew = trimmed.toLowerCase().replace(/\s+/g, ' ');
    const isDuplicate = this.symptoms().some(
      (s) => s.toLowerCase().replace(/\s+/g, ' ') === normalizedNew,
    );

    if (isDuplicate) {
      this.inputError.set('This symptom has already been added.');
      return;
    }

    // Add symptom
    this.symptoms.update((list) => [...list, trimmed]);
    this.symptomInput.reset('');
    this.inputError.set(null);

    if (!this.canAddMore()) {
      this.symptomInput.disable();
    }

    this.announce(
      `Added symptom: "${trimmed}". ${this.symptoms().length} of ${MAX_SYMPTOMS} symptoms added.`,
    );

    this.focusInput();
  }

  /**
   * Removes a symptom by index.
   */
  removeSymptom(index: number): void {
    const list = this.symptoms();
    if (index < 0 || index >= list.length) {
      return;
    }

    const removed = list[index];
    this.symptoms.update((current) => current.filter((_, i) => i !== index));
    this.inputError.set(null);

    if (this.canAddMore() && this.symptomInput.disabled) {
      this.symptomInput.enable();
    }

    this.announce(
      `Removed symptom: "${removed}". ${this.symptoms().length} of ${MAX_SYMPTOMS} symptoms remaining.`,
    );

    this.focusInput();
  }

  /**
   * Announces an action politely to screen readers via aria-live.
   */
  private announce(message: string): void {
    this.liveAnnouncement.set(message);
  }

  private focusInput(): void {
    setTimeout(() => {
      this.symptomInputRef?.nativeElement?.focus();
    }, 0);
  }
}
