import json

from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .pdf import generate_prescription_pdf
from .serializers import PrescriptionPdfSerializer


@csrf_exempt
@require_http_methods(['POST'])
def generate_pdf(request):
    """
    POST /prescriptions/pdf

    Validates prescription input JSON and returns a generated PDF as application/pdf.
    Errors are returned as JSON with appropriate HTTP status codes.
    """
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

    serializer = PrescriptionPdfSerializer(data=data)
    if not serializer.is_valid():
        errors = serializer.errors
        first_field = next(iter(errors))
        first_message = errors[first_field]
        if isinstance(first_message, list):
            first_message = first_message[0]
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

    # Generate raw PDF bytes with ReportLab
    validated = serializer.validated_data
    pdf_bytes = generate_prescription_pdf(validated)

    prescription_id = validated.get('prescriptionId', 'prescription')
    response = HttpResponse(pdf_bytes, content_type='application/pdf')
    response['Content-Disposition'] = f'inline; filename="prescription_{prescription_id}.pdf"'
    return response
