from django.test import SimpleTestCase, override_settings


class HealthTests(SimpleTestCase):
    def test_health_returns_ok(self):
        response = self.client.get('/health')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'status': 'ok'})


@override_settings(AI_SERVICE_KEY='valid-test-key')
class ServiceKeyMiddlewareTests(SimpleTestCase):
    def test_health_exempt_from_service_key(self):
        """GET /health must be accessible without any X-Service-Key."""
        response = self.client.get('/health')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'status': 'ok'})

    def test_protected_route_missing_key_returns_403(self):
        """Requests to protected routes without X-Service-Key return 403."""
        response = self.client.get('/admin/')
        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.json(),
            {'message': 'Forbidden: invalid or missing service key', 'code': 'FORBIDDEN'},
        )

    def test_protected_route_invalid_key_returns_403(self):
        """Requests to protected routes with wrong X-Service-Key return 403."""
        response = self.client.get('/admin/', HTTP_X_SERVICE_KEY='wrong-secret')
        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.json(),
            {'message': 'Forbidden: invalid or missing service key', 'code': 'FORBIDDEN'},
        )

    def test_protected_route_valid_key_passes_middleware(self):
        """Requests with valid X-Service-Key pass middleware and reach URL resolver / views."""
        response = self.client.get('/admin/', HTTP_X_SERVICE_KEY='valid-test-key')
        # Passes the 403 middleware check (reaches the admin redirect or view)
        self.assertNotEqual(response.status_code, 403)

    @override_settings(AI_SERVICE_KEY='')
    def test_key_not_configured_refuses_protected_request(self):
        """If AI_SERVICE_KEY is unset or empty, all protected requests are rejected."""
        response = self.client.get('/admin/', HTTP_X_SERVICE_KEY='any-key')
        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.json(),
            {'message': 'Forbidden: service key is not configured', 'code': 'FORBIDDEN'},
        )
