import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  computed,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import {
  FALLBACK_DISCLAIMER,
  MAX_SYMPTOM_LENGTH,
  MAX_SYMPTOMS,
  MIN_SYMPTOMS,
  SymptomCheckPagination,
  SymptomCheckResult,
} from '../../../core/symptom-checker/symptom-checker.models';
import { SymptomCheckerService } from '../../../core/symptom-checker/symptom-checker.service';

@Component({
  selector: 'app-patient-symptom-checker',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './patient-symptom-checker.html',
  styleUrl: './patient-symptom-checker.css',
})
export class PatientSymptomChecker implements OnInit, OnDestroy {
  protected readonly symptomCheckerService = inject(SymptomCheckerService);
  private readonly fb = inject(NonNullableFormBuilder);

  @ViewChild('symptomInputRef') symptomInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('resultHeadingRef') resultHeadingRef?: ElementRef<HTMLHeadingElement>;

  // Form input control
  readonly symptomInput = this.fb.control('');
  readonly inputValue = toSignal(this.symptomInput.valueChanges, { initialValue: '' });

  // Symptoms entry state
  readonly symptoms = signal<string[]>([]);
  readonly inputError = signal<string | null>(null);
  readonly liveAnnouncement = signal<string>('');

  // Assessment submission state
  readonly submitting = signal<boolean>(false);
  readonly submissionError = signal<string | null>(null);
  readonly currentResult = signal<SymptomCheckResult | null>(null);

  // History state
  readonly history = signal<SymptomCheckResult[]>([]);
  readonly loadingHistory = signal<boolean>(false);
  readonly historyError = signal<string | null>(null);
  readonly pagination = signal<SymptomCheckPagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  readonly expandedHistoryIds = signal<Set<string>>(new Set<string>());

  // Fallback disclaimer constant for clinical safety
  readonly fallbackDisclaimer = FALLBACK_DISCLAIMER;

  // Limits & counters
  readonly maxSymptoms = MAX_SYMPTOMS;
  readonly maxSymptomLength = MAX_SYMPTOM_LENGTH;
  readonly minSymptoms = MIN_SYMPTOMS;

  readonly currentInputLength = computed(() => (this.inputValue() || '').length);
  readonly totalSymptomsCount = computed(() => this.symptoms().length);
  readonly canAddMore = computed(() => this.symptoms().length < MAX_SYMPTOMS && !this.submitting());
  readonly canSubmit = computed(() => this.symptoms().length >= MIN_SYMPTOMS && !this.submitting());

  readonly isEmergency = computed(() => this.currentResult()?.assessment.urgencyLevel === 'emergency');

  ngOnInit(): void {
    this.loadHistory(1);
  }

  ngOnDestroy(): void {
    // Memory hygiene for privacy: zero medical information lingers in memory (NFR-08)
    this.symptoms.set([]);
    this.currentResult.set(null);
    this.history.set([]);
    this.symptomCheckerService.clearMemory();
  }

  /**
   * Adds the current input value as a symptom chip.
   */
  addSymptom(): void {
    if (this.submitting()) {
      return;
    }

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

    const normalizedNew = trimmed.toLowerCase().replace(/\s+/g, ' ');
    const isDuplicate = this.symptoms().some(
      (s) => s.toLowerCase().replace(/\s+/g, ' ') === normalizedNew,
    );

    if (isDuplicate) {
      this.inputError.set('This symptom has already been added.');
      return;
    }

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
   * Removes a symptom chip by index.
   */
  removeSymptom(index: number): void {
    if (this.submitting()) {
      return;
    }

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
   * Submits the entered symptoms list for AI assessment.
   */
  submitCheck(): void {
    if (!this.canSubmit() || this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.submissionError.set(null);
    this.symptomInput.disable();

    this.symptomCheckerService.checkSymptoms(this.symptoms()).subscribe({
      next: (response) => {
        this.submitting.set(false);
        if (this.canAddMore()) {
          this.symptomInput.enable();
        }
        this.currentResult.set(response.result);

        const urgency = response.result.assessment.urgencyLevel;
        if (urgency === 'emergency') {
          this.announce(
            'Emergency alert: Your symptoms indicate an urgent medical situation. Seek immediate emergency assistance.',
          );
        } else {
          this.announce('Symptom assessment complete. Please review the guidance below.');
        }

        // Focus result heading for keyboard accessibility
        setTimeout(() => {
          this.resultHeadingRef?.nativeElement?.focus();
        }, 100);

        // Prepend new check to history list and increment total count
        this.history.update((prev) => [response.result, ...prev]);
        this.pagination.update((p) => ({ ...p, total: p.total + 1 }));
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        if (this.canAddMore()) {
          this.symptomInput.enable();
        }
        if (err.status === 0) {
          this.submissionError.set('Cannot reach the server. Please try again.');
        } else if (err.error && typeof err.error.message === 'string') {
          this.submissionError.set(err.error.message);
        } else {
          this.submissionError.set(
            'Symptom checker service is temporarily unavailable. Please try again later.',
          );
        }
      },
    });
  }

  /**
   * Resets the form and current assessment result without altering patient history.
   */
  startNewCheck(): void {
    this.symptoms.set([]);
    this.currentResult.set(null);
    this.submissionError.set(null);
    this.inputError.set(null);
    this.symptomInput.reset('');
    this.symptomInput.enable();

    this.announce('Symptom checker reset. Enter new symptoms.');
    this.focusInput();
  }

  /**
   * Loads paginated patient history.
   */
  loadHistory(page: number): void {
    this.loadingHistory.set(true);
    this.historyError.set(null);

    this.symptomCheckerService.getHistory(page, this.pagination().limit).subscribe({
      next: (res) => {
        this.loadingHistory.set(false);
        this.history.set(res.results);
        this.pagination.set(res.pagination);
      },
      error: (err: HttpErrorResponse) => {
        this.loadingHistory.set(false);
        if (err.status === 0) {
          this.historyError.set('Cannot reach the server. Please try again.');
        } else if (err.error && typeof err.error.message === 'string') {
          this.historyError.set(err.error.message);
        } else {
          this.historyError.set('Failed to load past symptom checks. Please try again.');
        }
      },
    });
  }

  /**
   * Toggles the expand/collapse state of a history card.
   */
  toggleHistoryCard(id: string): void {
    this.expandedHistoryIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  isCardExpanded(id: string): boolean {
    return this.expandedHistoryIds().has(id);
  }

  /**
   * History pagination handlers.
   */
  onPrevPage(): void {
    const current = this.pagination().page;
    if (current > 1) {
      this.loadHistory(current - 1);
    }
  }

  onNextPage(): void {
    const p = this.pagination();
    if (p.page < p.totalPages) {
      this.loadHistory(p.page + 1);
    }
  }

  formatDate(isoString: string): string {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return date.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return isoString;
    }
  }

  private announce(message: string): void {
    this.liveAnnouncement.set(message);
  }

  private focusInput(): void {
    setTimeout(() => {
      this.symptomInputRef?.nativeElement?.focus();
    }, 0);
  }
}
