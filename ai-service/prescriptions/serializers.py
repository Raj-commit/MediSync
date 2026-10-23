"""
Input validation for POST /prescriptions/pdf.

All text fields are validated for type and length before any PDF generation
happens. ReportLab never sees un-validated input.
"""

from rest_framework import serializers

# Limits to keep PDFs sane and prevent abuse
FIELD_MAX_LEN = 200   # general name/id fields
ITEM_MAX_LEN = 500    # instructions may be longer than names
MAX_ITEMS = 50        # maximum medicines per prescription


class PrescriptionItemSerializer(serializers.Serializer):
    medicine = serializers.CharField(
        max_length=FIELD_MAX_LEN,
        error_messages={
            'required': 'Each item must include "medicine".',
            'blank': '"medicine" must not be blank.',
            'max_length': f'"medicine" must be {FIELD_MAX_LEN} characters or fewer.',
        },
    )
    dosage = serializers.CharField(
        max_length=FIELD_MAX_LEN,
        error_messages={
            'required': 'Each item must include "dosage".',
            'blank': '"dosage" must not be blank.',
            'max_length': f'"dosage" must be {FIELD_MAX_LEN} characters or fewer.',
        },
    )
    instructions = serializers.CharField(
        max_length=ITEM_MAX_LEN,
        error_messages={
            'required': 'Each item must include "instructions".',
            'blank': '"instructions" must not be blank.',
            'max_length': f'"instructions" must be {ITEM_MAX_LEN} characters or fewer.',
        },
    )


class PrescriptionPdfSerializer(serializers.Serializer):
    prescriptionId = serializers.CharField(
        max_length=FIELD_MAX_LEN,
        error_messages={
            'required': '"prescriptionId" is required.',
            'blank': '"prescriptionId" must not be blank.',
            'max_length': f'"prescriptionId" must be {FIELD_MAX_LEN} characters or fewer.',
        },
    )
    patientName = serializers.CharField(
        max_length=FIELD_MAX_LEN,
        error_messages={
            'required': '"patientName" is required.',
            'blank': '"patientName" must not be blank.',
            'max_length': f'"patientName" must be {FIELD_MAX_LEN} characters or fewer.',
        },
    )
    doctorName = serializers.CharField(
        max_length=FIELD_MAX_LEN,
        error_messages={
            'required': '"doctorName" is required.',
            'blank': '"doctorName" must not be blank.',
            'max_length': f'"doctorName" must be {FIELD_MAX_LEN} characters or fewer.',
        },
    )
    issuedDate = serializers.DateField(
        input_formats=['%Y-%m-%d'],
        error_messages={
            'required': '"issuedDate" is required.',
            'invalid': '"issuedDate" must be a valid date in YYYY-MM-DD format.',
        },
    )
    items = serializers.ListField(
        child=PrescriptionItemSerializer(),
        min_length=1,
        max_length=MAX_ITEMS,
        error_messages={
            'required': '"items" is required.',
            'not_a_list': '"items" must be a list.',
            'min_length': '"items" must contain at least one medicine.',
            'max_length': f'"items" must contain at most {MAX_ITEMS} medicines.',
        },
    )
