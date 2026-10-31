"""
Unit tests for the rule-based symptom checker engine (symptom_checker.engine).
"""

import unittest

from .engine import (
    assess_symptoms,
    identify_mild_symptoms,
    identify_red_flags,
    is_negated,
    normalize_text,
)
from .rules import EMERGENCY_NOTICE, MANDATORY_DISCLAIMER


class EngineUnitTests(unittest.TestCase):
    def test_normalize_text_lowercases_and_strips_punctuation_and_whitespace(self):
        """Punctuation is replaced with spaces, multiple spaces collapsed, text lowercased."""
        self.assertEqual(normalize_text("  FEVER!!  "), "fever")
        self.assertEqual(
            normalize_text("High   Temperature, With Cough..."),
            "high temperature with cough",
        )
        self.assertEqual(normalize_text(""), "")
        self.assertEqual(normalize_text(None), "")

    def test_is_negated(self):
        """Negated phrases are correctly detected."""
        self.assertTrue(is_negated("no chest pain"))
        self.assertTrue(is_negated("not experiencing fever"))
        self.assertTrue(is_negated("denies shortness of breath"))
        self.assertTrue(is_negated("without headache"))
        self.assertFalse(is_negated("chest pain"))
        self.assertFalse(is_negated("fever"))

    def test_synonyms_resolve_to_canonical_mild_symptom(self):
        """Synonyms are correctly mapped to canonical forms."""
        self.assertEqual(identify_mild_symptoms(["high temperature"]), ["fever"])
        self.assertEqual(identify_mild_symptoms(["feverish"]), ["fever"])
        self.assertEqual(identify_mild_symptoms(["stomach ache"]), ["abdominal pain"])
        self.assertEqual(identify_mild_symptoms(["belly pain"]), ["abdominal pain"])
        self.assertEqual(identify_mild_symptoms(["throwing up"]), ["vomiting"])

    def test_duplicate_symptoms_and_synonyms_count_as_one(self):
        """Multiple synonyms for the same canonical symptom count as 1."""
        mild = identify_mild_symptoms(["fever", "high temperature", "feverish"])
        self.assertEqual(mild, ["fever"])

    def test_emergency_red_flags_trigger_emergency_urgency(self):
        """Every listed red-flag category triggers emergency urgency level."""
        red_flag_cases = [
            ("chest pain", "cardiovascular"),
            ("chest tightness", "cardiovascular"),
            ("shortness of breath", "respiratory"),
            ("severe wheezing", "respiratory"),
            ("facial drooping", "neurological"),
            ("slurred speech", "neurological"),
            ("loss of consciousness", "neurological"),
            ("fainting", "neurological"),
            ("severe uncontrolled bleeding", "trauma"),
            ("severe allergic reaction", "allergy"),
            ("throat swelling", "allergy"),
            ("thunderclap headache", "neurological"),
            ("thoughts of self harm", "mental_health"),
            ("suicidal thoughts", "mental_health"),
        ]

        for symptom, expected_cat in red_flag_cases:
            with self.subTest(symptom=symptom):
                res = assess_symptoms([symptom])
                self.assertEqual(res["urgency_level"], "emergency")
                self.assertTrue(res["assessment"].startswith(EMERGENCY_NOTICE))
                self.assertEqual(res["disclaimer"], MANDATORY_DISCLAIMER)
                self.assertGreater(len(res["possible_conditions"]), 0)

    def test_negated_red_flag_does_not_trigger_emergency(self):
        """A negated phrase like 'no chest pain' must not trigger an emergency."""
        res = assess_symptoms(["no chest pain", "mild cough"])
        self.assertNotEqual(res["urgency_level"], "emergency")
        self.assertEqual(res["urgency_level"], "routine")
        self.assertNotIn(EMERGENCY_NOTICE, res["assessment"])

    def test_emergency_priority_over_multiple_mild_symptoms(self):
        """Emergency red flags always override the multiple-mild-symptoms rule."""
        res = assess_symptoms(["fever", "cough", "sore throat", "fatigue", "chest pain"])
        self.assertEqual(res["urgency_level"], "emergency")
        self.assertTrue(res["assessment"].startswith(EMERGENCY_NOTICE))

    def test_three_or_more_distinct_mild_symptoms_produce_urgent(self):
        """Three or more distinct canonical mild symptoms produce 'urgent' urgency."""
        res = assess_symptoms(["fever", "cough", "sore throat"])
        self.assertEqual(res["urgency_level"], "urgent")
        self.assertIn("multiple", res["assessment"].lower())
        self.assertIn("24 hours", res["assessment"])
        self.assertEqual(res["disclaimer"], MANDATORY_DISCLAIMER)

    def test_fewer_than_three_mild_symptoms_produce_routine(self):
        """One or two distinct mild symptoms produce 'routine' urgency."""
        res_one = assess_symptoms(["cough"])
        self.assertEqual(res_one["urgency_level"], "routine")

        res_two = assess_symptoms(["fever", "cough"])
        self.assertEqual(res_two["urgency_level"], "routine")

    def test_unknown_symptoms_safely_ignored_when_mixed_with_known(self):
        """Unknown symptoms are ignored, processing known ones normally."""
        res = assess_symptoms(["fever", "cough", "some-unrecognized-gibberish-xyz"])
        self.assertEqual(res["urgency_level"], "routine")
        self.assertIn("Common Cold", res["possible_conditions"])

    def test_all_unknown_symptoms_returns_fallback(self):
        """If no symptoms are recognized, return transparent fallback response."""
        res = assess_symptoms(["completely unknown symptom abc", "another random phrase"])
        self.assertEqual(res["urgency_level"], "routine")
        self.assertEqual(res["possible_conditions"], [])
        self.assertEqual(res["suggested_specialisation"], "General Physician")
        self.assertIn("could not be reliably matched", res["assessment"])
        self.assertEqual(res["disclaimer"], MANDATORY_DISCLAIMER)

    def test_assessment_is_strictly_deterministic(self):
        """Identical inputs produce identical outputs across multiple executions."""
        input_symptoms = ["cough", "headache", "fever"]
        first_run = assess_symptoms(input_symptoms)

        for _ in range(50):
            self.assertEqual(assess_symptoms(input_symptoms), first_run)
