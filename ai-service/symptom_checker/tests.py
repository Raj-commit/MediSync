import json

from django.test import SimpleTestCase, override_settings

from .rules import EMERGENCY_NOTICE, MANDATORY_DISCLAIMER

VALID_KEY = "change-me-shared-secret"
ENDPOINT = "/api/symptom-checker/check"

ALLOWED_RESPONSE_FIELDS = {
    "assessment",
    "possible_conditions",
    "urgency_level",
    "suggested_specialisation",
    "general_advice",
    "disclaimer",
}

BOOKING_CATALOGUE_SPECIALISATIONS = {
    "General Physician",
    "Cardiology",
    "Dermatology",
    "Neurology",
    "Orthopedics",
    "Pulmonology",
    "Gastroenterology",
    "Psychiatry",
    "Pediatrics",
    "Internal Medicine",
}


@override_settings(AI_SERVICE_KEY=VALID_KEY)
class SymptomCheckerEndpointTests(SimpleTestCase):
    endpoint = ENDPOINT

    def post_json(self, payload, key=VALID_KEY, content_type="application/json"):
        headers = {}
        if key is not None:
            headers["HTTP_X_SERVICE_KEY"] = key
        data = json.dumps(payload) if isinstance(payload, (dict, list)) else payload
        return self.client.post(self.endpoint, data=data, content_type=content_type, **headers)

    # -------------------------------------------------------------
    # 1. Service Key (Authentication) Tests
    # -------------------------------------------------------------

    def test_missing_service_key_returns_403(self):
        """Requests without X-Service-Key header must return 403."""
        response = self.post_json({"symptoms": ["fever"]}, key=None)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.json(),
            {"message": "Forbidden: invalid or missing service key", "code": "FORBIDDEN"},
        )

    def test_wrong_service_key_returns_403(self):
        """Requests with an invalid X-Service-Key header must return 403."""
        response = self.post_json({"symptoms": ["fever"]}, key="invalid-secret-key")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.json(),
            {"message": "Forbidden: invalid or missing service key", "code": "FORBIDDEN"},
        )

    @override_settings(AI_SERVICE_KEY="")
    def test_unconfigured_service_key_returns_403(self):
        """If AI_SERVICE_KEY is unset or empty, all protected requests are refused."""
        response = self.post_json({"symptoms": ["fever"]}, key=VALID_KEY)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.json(),
            {"message": "Forbidden: service key is not configured", "code": "FORBIDDEN"},
        )

    # -------------------------------------------------------------
    # 2. HTTP Method & Bad JSON Tests
    # -------------------------------------------------------------

    def test_wrong_http_methods_return_405(self):
        """GET, PUT, PATCH, DELETE are rejected with 405 Method Not Allowed."""
        for method in ["get", "put", "patch", "delete"]:
            with self.subTest(method=method):
                caller = getattr(self.client, method)
                response = caller(self.endpoint, HTTP_X_SERVICE_KEY=VALID_KEY)
                self.assertEqual(response.status_code, 405)

    def test_malformed_json_returns_400_invalid_json(self):
        """Invalid JSON syntax returns 400 with INVALID_JSON code."""
        response = self.post_json("not-valid-json{", content_type="application/json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "INVALID_JSON")
        self.assertIn("valid JSON", response.json()["message"])

    def test_non_dict_json_returns_400_invalid_json(self):
        """A JSON array or primitive at the root returns 400 with INVALID_JSON code."""
        response = self.post_json(["fever", "cough"])
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "INVALID_JSON")
        self.assertIn("JSON object", response.json()["message"])

    # -------------------------------------------------------------
    # 3. Request Validation Tests
    # -------------------------------------------------------------

    def test_missing_symptoms_key_returns_400_validation_error(self):
        """Missing 'symptoms' key returns 400 VALIDATION_ERROR."""
        response = self.post_json({})
        self.assertEqual(response.status_code, 400)
        body = response.json()
        self.assertEqual(body["code"], "VALIDATION_ERROR")
        self.assertEqual(body["field"], "symptoms")

    def test_symptoms_not_a_list_returns_400_validation_error(self):
        """'symptoms' must be a list, not string or object."""
        response = self.post_json({"symptoms": "fever"})
        self.assertEqual(response.status_code, 400)
        body = response.json()
        self.assertEqual(body["code"], "VALIDATION_ERROR")
        self.assertEqual(body["field"], "symptoms")
        self.assertIn("must be a list", body["message"])

    def test_empty_symptoms_list_returns_400_validation_error(self):
        """Empty 'symptoms' list returns 400 VALIDATION_ERROR."""
        response = self.post_json({"symptoms": []})
        self.assertEqual(response.status_code, 400)
        body = response.json()
        self.assertEqual(body["code"], "VALIDATION_ERROR")
        self.assertEqual(body["field"], "symptoms")
        self.assertIn("at least one symptom", body["message"])

    def test_symptoms_exceeding_max_items_returns_400_validation_error(self):
        """More than 10 symptoms returns 400 VALIDATION_ERROR."""
        eleven_symptoms = [f"symptom {i}" for i in range(11)]
        response = self.post_json({"symptoms": eleven_symptoms})
        self.assertEqual(response.status_code, 400)
        body = response.json()
        self.assertEqual(body["code"], "VALIDATION_ERROR")
        self.assertEqual(body["field"], "symptoms")
        self.assertIn("at most 10 symptoms", body["message"])

    def test_blank_string_item_returns_400_validation_error(self):
        """Blank or whitespace-only symptom strings are rejected."""
        response = self.post_json({"symptoms": ["   "]})
        self.assertEqual(response.status_code, 400)
        body = response.json()
        self.assertEqual(body["code"], "VALIDATION_ERROR")
        self.assertIn("must not be blank", body["message"])

    def test_non_string_item_returns_400_validation_error(self):
        """Non-string list items (e.g. numbers or dicts) are rejected."""
        response = self.post_json({"symptoms": [123]})
        self.assertEqual(response.status_code, 400)
        body = response.json()
        self.assertEqual(body["code"], "VALIDATION_ERROR")
        self.assertIn("must be a string", body["message"])

    def test_symptom_exceeding_100_chars_returns_400_validation_error(self):
        """A symptom string longer than 100 characters is rejected."""
        long_symptom = "a" * 101
        response = self.post_json({"symptoms": [long_symptom]})
        self.assertEqual(response.status_code, 400)
        body = response.json()
        self.assertEqual(body["code"], "VALIDATION_ERROR")
        self.assertIn("100 characters or fewer", body["message"])

    def test_unknown_json_keys_rejected_with_400_validation_error(self):
        """Any unexpected top-level JSON key returns 400 VALIDATION_ERROR."""
        response = self.post_json({"symptoms": ["fever"], "patientAge": 25})
        self.assertEqual(response.status_code, 400)
        body = response.json()
        self.assertEqual(body["code"], "VALIDATION_ERROR")
        self.assertIn("patientAge", body["message"])

    # -------------------------------------------------------------
    # 4. Successful Assessment & Response Shape Tests
    # -------------------------------------------------------------

    def test_successful_assessment_returns_exact_fields_and_types(self):
        """Valid request returns 200 with exactly the allowed fields and valid types."""
        response = self.post_json({"symptoms": ["fever", "cough"]})
        self.assertEqual(response.status_code, 200)
        data = response.json()

        # Check field presence and that NO extra keys appear in the output
        self.assertEqual(set(data.keys()), ALLOWED_RESPONSE_FIELDS)

        self.assertIsInstance(data["assessment"], str)
        self.assertIsInstance(data["possible_conditions"], list)
        self.assertIn(data["urgency_level"], {"emergency", "urgent", "routine"})
        self.assertIn(data["suggested_specialisation"], BOOKING_CATALOGUE_SPECIALISATIONS)
        self.assertIsInstance(data["general_advice"], list)
        self.assertEqual(data["disclaimer"], MANDATORY_DISCLAIMER)

    def test_normalization_handles_case_punctuation_and_spaces(self):
        """Uppercase, punctuation, and extra whitespace are normalized cleanly."""
        response = self.post_json({"symptoms": ["  FEVER!!  ", "Cough...  "]})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["urgency_level"], "routine")
        self.assertIn("Common Cold", data["possible_conditions"])

    def test_synonyms_and_duplicates_count_as_single_canonical_symptom(self):
        """Multiple synonyms for the same symptom count as 1, keeping urgency routine."""
        response = self.post_json({"symptoms": ["fever", "high temperature", "feverish"]})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        # Counted as 1 distinct symptom -> routine
        self.assertEqual(data["urgency_level"], "routine")

    def test_three_or_more_distinct_mild_symptoms_produce_urgent(self):
        """Three distinct mild symptoms produce 'urgent' urgency with 24h advice."""
        response = self.post_json({"symptoms": ["fever", "cough", "sore throat"]})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["urgency_level"], "urgent")
        self.assertIn("24 hours", data["assessment"])

    def test_fewer_than_three_mild_symptoms_produce_routine(self):
        """Fewer than three distinct mild symptoms produce 'routine' urgency."""
        response = self.post_json({"symptoms": ["headache", "fatigue"]})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["urgency_level"], "routine")

    # -------------------------------------------------------------
    # 5. Red-Flag Emergency Detection & Priority Tests
    # -------------------------------------------------------------

    def test_every_red_flag_category_triggers_emergency(self):
        """Each of the 8 required red-flag categories triggers emergency."""
        red_flag_samples = [
            "chest pain",
            "shortness of breath",
            "facial drooping",
            "loss of consciousness",
            "severe uncontrolled bleeding",
            "severe allergic reaction",
            "thunderclap headache",
            "thoughts of suicide",
        ]

        for rf in red_flag_samples:
            with self.subTest(red_flag=rf):
                response = self.post_json({"symptoms": [rf]})
                self.assertEqual(response.status_code, 200)
                data = response.json()
                self.assertEqual(data["urgency_level"], "emergency")
                self.assertTrue(data["assessment"].startswith(EMERGENCY_NOTICE))
                self.assertIn("emergency services", data["assessment"].lower())
                self.assertEqual(data["disclaimer"], MANDATORY_DISCLAIMER)

    def test_emergency_priority_over_multiple_mild_symptoms(self):
        """Emergency takes strict priority and cannot be downgraded by mild symptoms."""
        response = self.post_json(
            {"symptoms": ["fever", "cough", "sore throat", "fatigue", "chest pain"]}
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["urgency_level"], "emergency")
        self.assertTrue(data["assessment"].startswith(EMERGENCY_NOTICE))

    def test_negated_red_flag_does_not_trigger_emergency(self):
        """A negated phrase like 'no chest pain' must not trigger an emergency."""
        response = self.post_json({"symptoms": ["no chest pain", "cough"]})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["urgency_level"], "routine")
        self.assertNotIn(EMERGENCY_NOTICE, data["assessment"])

    # -------------------------------------------------------------
    # 6. Unknown Symptoms & Fallback Tests
    # -------------------------------------------------------------

    def test_unknown_symptoms_ignored_when_mixed_with_known(self):
        """Unknown symptoms in a list are ignored, valid ones processed."""
        response = self.post_json({"symptoms": ["fever", "completely unrecognized symptom 123"]})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["urgency_level"], "routine")
        self.assertIn("Common Cold", data["possible_conditions"])

    def test_all_unknown_symptoms_returns_fallback_response(self):
        """All-unknown symptoms return empty conditions and general evaluation advice."""
        response = self.post_json({"symptoms": ["unknown gibberish", "xyz random string"]})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["possible_conditions"], [])
        self.assertEqual(data["urgency_level"], "routine")
        self.assertEqual(data["suggested_specialisation"], "General Physician")
        self.assertIn("could not be reliably matched", data["assessment"])
        self.assertEqual(data["disclaimer"], MANDATORY_DISCLAIMER)

    def test_suggested_specialisation_matches_booking_catalogue(self):
        """Suggested specialisation is guaranteed to be from the booking catalogue."""
        test_inputs = [
            ["chest pain"],
            ["stomach ache"],
            ["skin rash"],
            ["joint pain"],
            ["fever"],
            ["unrecognised symptom"],
        ]
        for inp in test_inputs:
            with self.subTest(symptoms=inp):
                response = self.post_json({"symptoms": inp})
                self.assertEqual(response.status_code, 200)
                data = response.json()
                self.assertIn(
                    data["suggested_specialisation"],
                    BOOKING_CATALOGUE_SPECIALISATIONS,
                )
