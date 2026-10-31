"""
Deterministic rule-based symptom assessment engine for MediSync.

This module is pure Python with no external I/O, no database access,
no network calls, and no random state. The same inputs produce identical outputs.
A real machine learning or LLM service can drop in behind this interface in future.
"""

import re
from typing import Any, Dict, List, Set, Tuple

from .rules import (
    EMERGENCY_NOTICE,
    MANDATORY_DISCLAIMER,
    MILD_SYMPTOMS,
    NEGATION_PREFIXES,
    RED_FLAGS,
    SYNONYM_MAP,
)


def normalize_text(text: str) -> str:
    """
    Normalises symptom input by converting to lowercase, stripping punctuation,
    and collapsing repeated whitespace.
    """
    if not isinstance(text, str):
        return ""
    lowered = text.lower()
    # Replace all punctuation characters with a single space
    no_punct = re.sub(r"[^\w\s]", " ", lowered)
    # Collapse multiple whitespace characters into a single space and strip
    return re.sub(r"\s+", " ", no_punct).strip()


def is_negated(normalized_text: str) -> bool:
    """
    Checks if a symptom string is explicitly negated (e.g. 'no chest pain',
    'denies shortness of breath', 'without fever').
    """
    if not normalized_text:
        return False
    for prefix in NEGATION_PREFIXES:
        if normalized_text.startswith(prefix):
            return True
    return False


def identify_red_flags(normalized_symptoms: List[str]) -> List[Tuple[str, Dict[str, Any]]]:
    """
    Scans normalized symptom strings for matching emergency red flags,
    ignoring any phrases that are explicitly negated.
    Returns a list of (matched_flag_key, flag_data) pairs, ordered deterministically.
    """
    matched: List[Tuple[str, Dict[str, Any]]] = []
    seen_keys: Set[str] = set()

    for symptom in normalized_symptoms:
        if is_negated(symptom):
            continue

        for flag_key, flag_info in RED_FLAGS.items():
            if flag_key in seen_keys:
                continue

            for pattern in flag_info["patterns"]:
                # Match as a whole pattern or word boundary
                pattern_norm = normalize_text(pattern)
                if re.search(r"\b" + re.escape(pattern_norm) + r"\b", symptom):
                    matched.append((flag_key, flag_info))
                    seen_keys.add(flag_key)
                    break

    return matched


def resolve_mild_symptom(normalized_symptom: str) -> str | None:
    """
    Resolves a normalized symptom to a canonical mild symptom key if recognized.
    Checks exact matches, synonym dictionary, and keyword boundary matches.
    Returns None if negated or unrecognised.
    """
    if not normalized_symptom or is_negated(normalized_symptom):
        return None

    # 1. Direct canonical match
    if normalized_symptom in MILD_SYMPTOMS:
        return normalized_symptom

    # 2. Direct synonym match
    if normalized_symptom in SYNONYM_MAP:
        return SYNONYM_MAP[normalized_symptom]

    # 3. Substring / pattern match for canonical keys and synonyms
    for synonym, canonical in SYNONYM_MAP.items():
        if re.search(r"\b" + re.escape(synonym) + r"\b", normalized_symptom):
            return canonical

    for canonical in MILD_SYMPTOMS.keys():
        if re.search(r"\b" + re.escape(canonical) + r"\b", normalized_symptom):
            return canonical

    return None


def identify_mild_symptoms(normalized_symptoms: List[str]) -> List[str]:
    """
    Identifies all distinct recognized canonical mild symptoms from the inputs.
    Preserves first-seen order deterministically.
    Duplicates and synonyms of the same canonical symptom count as 1.
    """
    distinct_canonical: List[str] = []
    seen: Set[str] = set()

    for symptom in normalized_symptoms:
        canonical = resolve_mild_symptom(symptom)
        if canonical and canonical not in seen:
            seen.add(canonical)
            distinct_canonical.append(canonical)

    return distinct_canonical


def assess_symptoms(symptoms: List[str]) -> Dict[str, Any]:
    """
    Main assessment entry point.
    Takes a list of raw symptom strings and deterministically produces
    the structured assessment output.
    """
    normalized_list = [normalize_text(s) for s in symptoms if isinstance(s, str)]

    # 1. Check for Emergency Red Flags
    red_flag_matches = identify_red_flags(normalized_list)

    if red_flag_matches:
        # Priority 1: Emergency detected
        flag_names = [f[0].replace("_", " ") for f in red_flag_matches]
        primary_flag = red_flag_matches[0][1]

        assessment_text = (
            f"{EMERGENCY_NOTICE} "
            f"Reported emergency indicators: {', '.join(flag_names)}. "
            f"Immediate in-person emergency medical care is required."
        )

        conditions: List[str] = []
        for _, info in red_flag_matches:
            cond = info.get("condition")
            if cond and cond not in conditions:
                conditions.append(cond)

        advice = [
            "Contact your local emergency services (e.g., 112, 911, 999) immediately.",
            "Do not drive yourself to the hospital; await emergency medical transport if possible.",
            "Do not wait for a routine telemedicine consultation when experiencing emergency symptoms.",
        ]

        return {
            "assessment": assessment_text,
            "possible_conditions": conditions,
            "urgency_level": "emergency",
            "suggested_specialisation": primary_flag.get("specialisation", "General Physician"),
            "general_advice": advice,
            "disclaimer": MANDATORY_DISCLAIMER,
        }

    # 2. Check for Mild Symptoms
    distinct_mild = identify_mild_symptoms(normalized_list)

    if not distinct_mild:
        # Fallback: No recognized symptoms
        assessment_text = (
            "Your reported symptoms could not be reliably matched with our standard informational "
            "catalogue. Symptoms vary widely and require professional clinical examination. "
            "Please consult a qualified doctor for a comprehensive medical evaluation."
        )
        return {
            "assessment": assessment_text,
            "possible_conditions": [],
            "urgency_level": "routine",
            "suggested_specialisation": "General Physician",
            "general_advice": [
                "Schedule a clinical evaluation with a qualified medical doctor.",
                "Seek immediate emergency care if you develop sudden, severe, or worsening symptoms.",
                "Keep a log of your symptoms, their onset, and changes over time to share with your doctor.",
            ],
            "disclaimer": MANDATORY_DISCLAIMER,
        }

    # Compile conditions and advice from matched mild symptoms
    combined_conditions: List[str] = []
    combined_advice: List[str] = []
    specialisation_votes: Dict[str, int] = {}

    for sym in distinct_mild:
        info = MILD_SYMPTOMS[sym]
        for cond in info["conditions"]:
            if cond not in combined_conditions:
                combined_conditions.append(cond)

        for tip in info["advice"]:
            if tip not in combined_advice:
                combined_advice.append(tip)

        spec = info.get("specialisation", "General Physician")
        specialisation_votes[spec] = specialisation_votes.get(spec, 0) + 1

    # Select primary specialisation: highest vote, fallback to General Physician
    sorted_specs = sorted(
        specialisation_votes.keys(),
        key=lambda s: (-specialisation_votes[s], s),
    )
    suggested_spec = sorted_specs[0] if sorted_specs else "General Physician"

    # 3. Urgency: 3 or more distinct mild symptoms -> 'urgent', otherwise 'routine'
    symptom_display = ", ".join(distinct_mild)

    if len(distinct_mild) >= 3:
        urgency = "urgent"
        assessment_text = (
            f"You have reported {len(distinct_mild)} distinct co-occurring symptoms ({symptom_display}). "
            f"When multiple symptoms appear together, they may indicate a more systemic infection "
            f"or illness requiring timely attention. We advise consulting a doctor promptly, preferably "
            f"within 24 hours, rather than relying on self-management alone."
        )
        selected_advice = [
            "Consult a medical doctor promptly within 24 hours for a comprehensive evaluation.",
            "Avoid relying solely on self-management when experiencing multiple clustered symptoms.",
            "Seek urgent or emergency medical attention immediately if new acute symptoms arise.",
        ]
        # Append up to 2 specific home care tips
        for tip in combined_advice[:2]:
            if tip not in selected_advice:
                selected_advice.append(tip)
    else:
        urgency = "routine"
        assessment_text = (
            f"Your reported symptoms ({symptom_display}) are commonly associated with general or "
            f"upper respiratory and digestive conditions. These informational possibilities are not "
            f"a confirmed diagnosis. Please schedule a consultation with a doctor for an accurate evaluation."
        )
        selected_advice = combined_advice[:3]
        selected_advice.append("Consult a doctor if your symptoms persist, worsen, or fail to improve.")

    return {
        "assessment": assessment_text,
        "possible_conditions": combined_conditions,
        "urgency_level": urgency,
        "suggested_specialisation": suggested_spec,
        "general_advice": selected_advice,
        "disclaimer": MANDATORY_DISCLAIMER,
    }
