"""
View controller for the MediSync Symptom Checker API.
"""

import json

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .engine import assess_symptoms
from .serializers import SymptomCheckSerializer


@csrf_exempt
@require_http_methods(["POST"])
def check_symptoms(request):
    """
    POST /api/symptom-checker/check

    Validates submitted symptoms JSON and returns the preliminary informational
    assessment, possible conditions, urgency level, suggested doctor specialisation,
    general advice, and mandatory medical disclaimer.
    """
    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse(
            {"message": "Request body must be valid JSON.", "code": "INVALID_JSON"},
            status=400,
        )

    if not isinstance(data, dict):
        return JsonResponse(
            {"message": "Request body must be a JSON object.", "code": "INVALID_JSON"},
            status=400,
        )

    serializer = SymptomCheckSerializer(data=data)
    if not serializer.is_valid():
        errors = serializer.errors
        first_field = next(iter(errors))
        first_message = errors[first_field]
        if isinstance(first_message, list):
            first_message = first_message[0]
        if isinstance(first_message, dict):
            # Nested list item validation error
            nested_field = next(iter(first_message))
            nested_msg = first_message[nested_field]
            if isinstance(nested_msg, list):
                first_message = nested_msg[0]
            else:
                first_message = str(nested_msg)

        return JsonResponse(
            {
                "message": str(first_message),
                "code": "VALIDATION_ERROR",
                "field": str(first_field),
            },
            status=400,
        )

    validated_symptoms = serializer.validated_data["symptoms"]
    result = assess_symptoms(validated_symptoms)

    return JsonResponse(result, status=200)
