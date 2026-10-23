import json

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .serializers import PrescriptionPdfSerializer


@csrf_exempt
@require_http_methods(['POST'])
def generate_pdf(request):
    """
    POST /prescriptions/pdf

    Accepts JSON with prescriptionId, patientName, doctorName, issuedDate,
    and items[]. Validates all fields and returns 400 on bad input. PDF
    generation will be added in step 3.
    """
    # Parse the request body as JSON
    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse(
            {'message': 'Request body must be valid JSON.', 'code': 'INVALID_JSON'},
            status=400,
        )

    if not isinstance(data, dict):
        return JsonResponse(
            {'message': 'Request body must be a JSON object.', 'code': 'INVALID_JSON'},
            status=400,
        )

    # Validate input with the serializer
    serializer = PrescriptionPdfSerializer(data=data)
    if not serializer.is_valid():
        # Return the first validation error in a clean, human-readable format
        errors = serializer.errors
        first_field = next(iter(errors))
        first_message = errors[first_field]
        if isinstance(first_message, list):
            first_message = first_message[0]
        # DRF may return nested error dicts for ListField items; flatten simply
        if isinstance(first_message, dict):
            first_message = str(first_message)

        return JsonResponse(
            {
                'message': str(first_message),
                'code': 'VALIDATION_ERROR',
                'field': first_field,
            },
            status=400,
        )

    # Validated data — PDF generation will be wired in step 3
    validated = serializer.validated_data
    return JsonResponse({'message': 'Validation passed', 'data': str(validated)}, status=200)
