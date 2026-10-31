"""
Input validation for POST /api/symptom-checker/check.

Validates symptom strings, bounds, and ensures no unknown fields are accepted.
"""

from rest_framework import serializers

MIN_SYMPTOMS = 1
MAX_SYMPTOMS = 10
MAX_SYMPTOM_LENGTH = 100


class SymptomItemField(serializers.CharField):
    """
    Validates an individual symptom string: must be non-blank and at most 100 chars.
    """

    default_error_messages = {
        "blank": "Each symptom must not be blank.",
        "invalid": "Each symptom must be a string.",
    }

    def to_internal_value(self, data):
        if not isinstance(data, str):
            raise serializers.ValidationError("Each symptom must be a string.")
        trimmed = data.strip()
        if not trimmed:
            raise serializers.ValidationError("Each symptom must not be blank.")
        if len(trimmed) > MAX_SYMPTOM_LENGTH:
            raise serializers.ValidationError(
                f"Each symptom must be {MAX_SYMPTOM_LENGTH} characters or fewer."
            )
        return trimmed


class SymptomCheckSerializer(serializers.Serializer):
    ALLOWED_KEYS = {"symptoms"}

    symptoms = serializers.ListField(
        child=SymptomItemField(),
        min_length=MIN_SYMPTOMS,
        max_length=MAX_SYMPTOMS,
        error_messages={
            "required": '"symptoms" is required.',
            "not_a_list": '"symptoms" must be a list.',
            "min_length": '"symptoms" must contain at least one symptom.',
            "max_length": f'"symptoms" must contain at most {MAX_SYMPTOMS} symptoms.',
        },
    )

    def to_internal_value(self, data):
        # Strict: reject unknown top-level keys
        if isinstance(data, dict):
            unknown_keys = set(data.keys()) - self.ALLOWED_KEYS
            if unknown_keys:
                first_unknown = sorted(list(unknown_keys))[0]
                raise serializers.ValidationError(
                    {first_unknown: f'Unknown or forbidden field: "{first_unknown}".'}
                )
        return super().to_internal_value(data)
