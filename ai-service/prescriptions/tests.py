import json

from django.test import SimpleTestCase, override_settings

VALID_KEY = 'change-me-shared-secret'


@override_settings(AI_SERVICE_KEY=VALID_KEY)
class PrescriptionPdfEndpointTests(SimpleTestCase):
    endpoint = '/api/prescriptions/pdf'

    def valid_payload(self):
        return {
            'prescriptionId': 'rx-test-001',
            'patientName': 'Jane Doe',
            'doctorName': 'Dr. John Smith',
            'issuedDate': '2026-10-23',
            'items': [
                {
                    'medicine': 'Amoxicillin 500mg',
                    'dosage': '1 capsule',
                    'instructions': 'Three times daily with water for 7 days',
                },
                {
                    'medicine': 'Paracetamol 650mg',
                    'dosage': '1 tablet',
                    'instructions': 'As needed for fever, max 3 times daily',
                },
            ],
        }

    # -------------------------------------------------------------
    # 1. Service Key (Authentication) Tests
    # -------------------------------------------------------------

    def test_missing_service_key_returns_403(self):
        """Requests without X-Service-Key header must return 403."""
        response = self.client.post(
            self.endpoint,
            data=json.dumps(self.valid_payload()),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.json(),
            {'message': 'Forbidden: invalid or missing service key', 'code': 'FORBIDDEN'},
        )

    def test_wrong_service_key_returns_403(self):
        """Requests with incorrect X-Service-Key header must return 403."""
        response = self.client.post(
            self.endpoint,
            data=json.dumps(self.valid_payload()),
            content_type='application/json',
            HTTP_X_SERVICE_KEY='invalid-secret-key',
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.json(),
            {'message': 'Forbidden: invalid or missing service key', 'code': 'FORBIDDEN'},
        )

    @override_settings(AI_SERVICE_KEY='')
    def test_unconfigured_service_key_returns_403(self):
        """If AI_SERVICE_KEY is unset in the environment, all requests are refused."""
        response = self.client.post(
            self.endpoint,
            data=json.dumps(self.valid_payload()),
            content_type='application/json',
            HTTP_X_SERVICE_KEY=VALID_KEY,
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.json(),
            {'message': 'Forbidden: service key is not configured', 'code': 'FORBIDDEN'},
        )

    # -------------------------------------------------------------
    # 2. Successful PDF Generation Tests
    # -------------------------------------------------------------

    def test_valid_request_returns_pdf(self):
        """A valid request returns 200 with application/pdf and bytes starting with %PDF."""
        response = self.client.post(
            self.endpoint,
            data=json.dumps(self.valid_payload()),
            content_type='application/json',
            HTTP_X_SERVICE_KEY=VALID_KEY,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/pdf')
        # Standard PDF magic header
        self.assertTrue(response.content.startswith(b'%PDF'))
        # Non-trivial PDF size
        self.assertGreater(len(response.content), 500)
        self.assertIn('prescription_rx-test-001.pdf', response.get('Content-Disposition', ''))

    def test_pdf_generation_escapes_xml_markup(self):
        """User input containing HTML/XML tags and entities is safely escaped without error."""
        payload = self.valid_payload()
        payload['patientName'] = 'Jane <script>alert("xss")</script> & Doe'
        payload['doctorName'] = 'Dr. <b>Smith</b> & Partners'
        payload['items'][0]['instructions'] = 'Take <100mg> & avoid "alcohol" & \'dairy\''

        response = self.client.post(
            self.endpoint,
            data=json.dumps(payload),
            content_type='application/json',
            HTTP_X_SERVICE_KEY=VALID_KEY,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/pdf')
        self.assertTrue(response.content.startswith(b'%PDF'))

    # -------------------------------------------------------------
    # 3. Input Validation Tests (400 Bad Request)
    # -------------------------------------------------------------

    def test_invalid_json_body_returns_400(self):
        """Malformed JSON body returns 400 INVALID_JSON."""
        response = self.client.post(
            self.endpoint,
            data='{invalid-json',
            content_type='application/json',
            HTTP_X_SERVICE_KEY=VALID_KEY,
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json().get('code'), 'INVALID_JSON')

    def test_non_dict_json_body_returns_400(self):
        """A JSON array instead of an object returns 400 INVALID_JSON."""
        response = self.client.post(
            self.endpoint,
            data=json.dumps(['item1', 'item2']),
            content_type='application/json',
            HTTP_X_SERVICE_KEY=VALID_KEY,
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json().get('code'), 'INVALID_JSON')

    def test_missing_prescription_id_returns_400(self):
        payload = self.valid_payload()
        del payload['prescriptionId']
        response = self.client.post(
            self.endpoint,
            data=json.dumps(payload),
            content_type='application/json',
            HTTP_X_SERVICE_KEY=VALID_KEY,
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json().get('code'), 'VALIDATION_ERROR')
        self.assertEqual(response.json().get('field'), 'prescriptionId')

    def test_missing_patient_name_returns_400(self):
        payload = self.valid_payload()
        del payload['patientName']
        response = self.client.post(
            self.endpoint,
            data=json.dumps(payload),
            content_type='application/json',
            HTTP_X_SERVICE_KEY=VALID_KEY,
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json().get('code'), 'VALIDATION_ERROR')
        self.assertEqual(response.json().get('field'), 'patientName')

    def test_missing_doctor_name_returns_400(self):
        payload = self.valid_payload()
        del payload['doctorName']
        response = self.client.post(
            self.endpoint,
            data=json.dumps(payload),
            content_type='application/json',
            HTTP_X_SERVICE_KEY=VALID_KEY,
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json().get('code'), 'VALIDATION_ERROR')
        self.assertEqual(response.json().get('field'), 'doctorName')

    def test_missing_issued_date_returns_400(self):
        payload = self.valid_payload()
        del payload['issuedDate']
        response = self.client.post(
            self.endpoint,
            data=json.dumps(payload),
            content_type='application/json',
            HTTP_X_SERVICE_KEY=VALID_KEY,
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json().get('code'), 'VALIDATION_ERROR')
        self.assertEqual(response.json().get('field'), 'issuedDate')

    def test_invalid_issued_date_format_returns_400(self):
        """Date not matching YYYY-MM-DD returns 400."""
        payload = self.valid_payload()
        payload['issuedDate'] = '23-10-2026'  # DD-MM-YYYY instead of YYYY-MM-DD
        response = self.client.post(
            self.endpoint,
            data=json.dumps(payload),
            content_type='application/json',
            HTTP_X_SERVICE_KEY=VALID_KEY,
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json().get('code'), 'VALIDATION_ERROR')
        self.assertEqual(response.json().get('field'), 'issuedDate')

    def test_empty_items_list_returns_400(self):
        """Prescription must have at least one medicine item."""
        payload = self.valid_payload()
        payload['items'] = []
        response = self.client.post(
            self.endpoint,
            data=json.dumps(payload),
            content_type='application/json',
            HTTP_X_SERVICE_KEY=VALID_KEY,
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json().get('code'), 'VALIDATION_ERROR')
        self.assertEqual(response.json().get('field'), 'items')

    def test_item_missing_medicine_field_returns_400(self):
        payload = self.valid_payload()
        del payload['items'][0]['medicine']
        response = self.client.post(
            self.endpoint,
            data=json.dumps(payload),
            content_type='application/json',
            HTTP_X_SERVICE_KEY=VALID_KEY,
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json().get('code'), 'VALIDATION_ERROR')
        self.assertEqual(response.json().get('field'), 'items')

    def test_blank_field_returns_400(self):
        """Whitespace/blank string is rejected."""
        payload = self.valid_payload()
        payload['prescriptionId'] = '   '
        response = self.client.post(
            self.endpoint,
            data=json.dumps(payload),
            content_type='application/json',
            HTTP_X_SERVICE_KEY=VALID_KEY,
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json().get('code'), 'VALIDATION_ERROR')

    def test_exceeding_max_items_returns_400(self):
        """More than 50 items is rejected."""
        payload = self.valid_payload()
        single_item = payload['items'][0]
        payload['items'] = [single_item for _ in range(51)]
        response = self.client.post(
            self.endpoint,
            data=json.dumps(payload),
            content_type='application/json',
            HTTP_X_SERVICE_KEY=VALID_KEY,
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json().get('code'), 'VALIDATION_ERROR')
        self.assertEqual(response.json().get('field'), 'items')

    # -------------------------------------------------------------
    # 4. HTTP Method Tests
    # -------------------------------------------------------------

    def test_get_method_not_allowed(self):
        """GET request to /api/prescriptions/pdf returns 405 Method Not Allowed."""
        response = self.client.get(
            self.endpoint,
            HTTP_X_SERVICE_KEY=VALID_KEY,
        )
        self.assertEqual(response.status_code, 405)
