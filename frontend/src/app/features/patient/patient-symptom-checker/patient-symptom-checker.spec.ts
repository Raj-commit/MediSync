import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { SymptomCheckerService } from '../../../core/symptom-checker/symptom-checker.service';
import { PatientSymptomChecker } from './patient-symptom-checker';

describe('PatientSymptomChecker - Step 2 Form & Symptoms Management', () => {
  let fixture: ComponentFixture<PatientSymptomChecker>;
  let component: PatientSymptomChecker;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PatientSymptomChecker],
      providers: [
        SymptomCheckerService,
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PatientSymptomChecker);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  it('1. adds a symptom using the Add button', () => {
    component.symptomInput.setValue('mild fever');
    fixture.detectChanges();

    const addBtn = element.querySelector('.button-add') as HTMLButtonElement;
    expect(addBtn.disabled).toBe(false);

    addBtn.click();
    fixture.detectChanges();

    expect(component.symptoms()).toEqual(['mild fever']);
    expect(component.symptomInput.value).toBe('');
    expect(element.textContent).toContain('mild fever');
    expect(component.liveAnnouncement()).toContain('Added symptom: "mild fever"');
  });

  it('2. adds a symptom using the Enter key', () => {
    const input = element.querySelector('#symptom-input') as HTMLInputElement;
    input.value = 'shortness of breath';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    fixture.detectChanges();

    expect(component.symptoms()).toEqual(['shortness of breath']);
    expect(element.textContent).toContain('shortness of breath');
  });

  it('3. removes an individual symptom chip and announces it', () => {
    component.symptoms.set(['fever', 'cough', 'fatigue']);
    fixture.detectChanges();

    const removeButtons = element.querySelectorAll<HTMLButtonElement>('.chip-remove');
    expect(removeButtons.length).toBe(3);

    // Remove the second symptom ('cough')
    removeButtons[1].click();
    fixture.detectChanges();

    expect(component.symptoms()).toEqual(['fever', 'fatigue']);
    expect(element.querySelector('.chips-list')?.textContent).not.toContain('cough');
    expect(component.liveAnnouncement()).toContain('Removed symptom: "cough"');
  });

  it('4. rejects blank or whitespace-only symptoms', () => {
    component.symptomInput.setValue('   ');
    component.addSymptom();
    fixture.detectChanges();

    expect(component.symptoms().length).toBe(0);
    expect(component.inputError()).toBe('Please enter a symptom description.');
    expect(element.querySelector('.field-error')?.textContent).toContain(
      'Please enter a symptom description.',
    );
  });

  it('5. enforces character limit of 100 characters', () => {
    const longText = 'a'.repeat(101);
    component.symptomInput.setValue(longText);
    component.addSymptom();
    fixture.detectChanges();

    expect(component.symptoms().length).toBe(0);
    expect(component.inputError()).toContain('100 characters or fewer');
  });

  it('6. prevents adding more than 10 symptoms', () => {
    // Add 9 symptoms
    for (let i = 1; i <= 9; i++) {
      component.symptomInput.setValue(`symptom-${i}`);
      component.addSymptom();
    }
    expect(component.symptoms().length).toBe(9);
    expect(component.canAddMore()).toBe(true);

    // Add 10th symptom
    component.symptomInput.setValue('symptom-10');
    component.addSymptom();
    fixture.detectChanges();

    expect(component.symptoms().length).toBe(10);
    expect(component.canAddMore()).toBe(false);
    expect(component.symptomInput.disabled).toBe(true);

    const input = element.querySelector('#symptom-input') as HTMLInputElement;
    expect(input.disabled).toBe(true);

    // Attempting to add 11th symptom
    component.symptomInput.enable();
    component.symptomInput.setValue('symptom-11');
    component.addSymptom();
    fixture.detectChanges();

    expect(component.symptoms().length).toBe(10);
    expect(component.inputError()).toBe('You can add at most 10 symptoms.');
  });

  it('7. prevents duplicate symptoms after case-insensitive and whitespace normalisation', () => {
    component.symptoms.set(['Chest Pain']);
    fixture.detectChanges();

    // Attempt to add '  chest   pain  '
    component.symptomInput.setValue('  chest   pain  ');
    component.addSymptom();
    fixture.detectChanges();

    expect(component.symptoms().length).toBe(1);
    expect(component.inputError()).toBe('This symptom has already been added.');
  });

  it('locks the submit button when symptom list is empty', () => {
    component.symptoms.set([]);
    fixture.detectChanges();

    const submitBtn = element.querySelector('.submit-btn') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);

    component.symptoms.set(['fever']);
    fixture.detectChanges();
    expect(submitBtn.disabled).toBe(false);
  });
});
