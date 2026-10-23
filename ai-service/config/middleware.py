import secrets
from django.conf import settings
from django.http import JsonResponse


class ServiceKeyMiddleware:
    """
    Rejects requests without a valid X-Service-Key header (value from env AI_SERVICE_KEY)
    with a 403 JSON error.

    - Uses secrets.compare_digest for timing-attack-safe comparison.
    - Exempts GET /health.
    - If AI_SERVICE_KEY is not configured or empty, refuses all protected requests.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Do not apply to GET /health (with or without trailing slash)
        if request.path.rstrip('/') == '/health' and request.method == 'GET':
            return self.get_response(request)

        expected_key = getattr(settings, 'AI_SERVICE_KEY', '')

        # If the key is not configured, refuse every protected request
        if not expected_key or not isinstance(expected_key, str):
            return JsonResponse(
                {
                    'message': 'Forbidden: service key is not configured',
                    'code': 'FORBIDDEN',
                },
                status=403,
            )

        provided_key = request.META.get('HTTP_X_SERVICE_KEY', '')

        # Compare provided key with expected key safely against timing attacks
        if not provided_key or not isinstance(provided_key, str) or not secrets.compare_digest(provided_key, expected_key):
            return JsonResponse(
                {
                    'message': 'Forbidden: invalid or missing service key',
                    'code': 'FORBIDDEN',
                },
                status=403,
            )

        return self.get_response(request)
