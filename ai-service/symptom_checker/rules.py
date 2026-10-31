"""
Curated knowledge base and rules for the MediSync rule-based symptom checker.

DISCLAIMER & MEDICAL NOTICE:
The mappings, conditions, and advice in this file are illustrative placeholders
designed for clinical safety triage and preliminary educational guidance.
They DO NOT constitute medical advice, diagnosis, or treatment plans.
"""

# Static mandatory disclaimer included in every symptom checker response
MANDATORY_DISCLAIMER = (
    "MediSync AI Symptom Checker provides preliminary informational guidance only. "
    "It is not a medical diagnosis or treatment plan. Consult a qualified healthcare "
    "professional for medical advice. Seek emergency assistance for severe or life-threatening symptoms."
)

# Emergency warning notice placed at the beginning of the assessment when a red flag is detected
EMERGENCY_NOTICE = (
    "EMERGENCY NOTICE: One or more reported symptoms indicate a potentially life-threatening "
    "medical emergency. Do not wait for a routine consultation. Please contact your local "
    "emergency services (e.g., 112, 911, 999) or go to the nearest emergency department immediately."
)

# Recognised Red-Flag symptom definitions
# Format: key -> dict of patterns, emergency guidance, suggested specialisation
RED_FLAGS = {
    "chest_pain": {
        "patterns": [
            "chest pain",
            "chest tightness",
            "pressure in chest",
            "pressure in the chest",
            "pain in chest",
            "crushing chest pain",
        ],
        "category": "cardiovascular",
        "condition": "Acute Coronary Syndrome / Acute Chest Emergency",
        "specialisation": "Cardiology",
    },
    "difficulty_breathing": {
        "patterns": [
            "difficulty breathing",
            "shortness of breath",
            "severe wheezing",
            "trouble breathing",
            "struggling to breathe",
            "cannot breathe",
            "cant breathe",
            "breathlessness",
        ],
        "category": "respiratory",
        "condition": "Acute Respiratory Distress",
        "specialisation": "Pulmonology",
    },
    "stroke_signs": {
        "patterns": [
            "facial drooping",
            "face drooping",
            "arm weakness",
            "speech difficulty",
            "slurred speech",
            "sudden weakness",
            "sudden numbness",
        ],
        "category": "neurological",
        "condition": "Suspected Stroke / Acute Neurological Deficit",
        "specialisation": "Neurology",
    },
    "loss_of_consciousness": {
        "patterns": [
            "loss of consciousness",
            "fainting",
            "unresponsiveness",
            "unresponsive",
            "passed out",
            "blacking out",
            "blackout",
            "syncope",
        ],
        "category": "neurological",
        "condition": "Syncope / Unconsciousness",
        "specialisation": "General Physician",
    },
    "severe_bleeding": {
        "patterns": [
            "severe bleeding",
            "severe uncontrolled bleeding",
            "uncontrolled bleeding",
            "heavy bleeding",
            "hemorrhage",
        ],
        "category": "trauma",
        "condition": "Acute Hemorrhage",
        "specialisation": "General Physician",
    },
    "anaphylaxis": {
        "patterns": [
            "severe allergic reaction",
            "anaphylaxis",
            "throat swelling",
            "tongue swelling",
            "swelling of throat",
            "swelling of tongue",
            "lips swelling",
        ],
        "category": "allergy",
        "condition": "Anaphylaxis / Severe Allergic Reaction",
        "specialisation": "General Physician",
    },
    "thunderclap_headache": {
        "patterns": [
            "sudden excruciating headache",
            "thunderclap headache",
            "worst headache of life",
            "sudden severe headache",
        ],
        "category": "neurological",
        "condition": "Suspected Intracranial Event / Thunderclap Headache",
        "specialisation": "Neurology",
    },
    "self_harm": {
        "patterns": [
            "thoughts of self harm",
            "thoughts of harming oneself",
            "thoughts of suicide",
            "suicidal thoughts",
            "suicide thoughts",
            "want to end my life",
        ],
        "category": "mental_health",
        "condition": "Acute Psychological Distress / Crisis",
        "specialisation": "Psychiatry",
    },
}

# Synonyms mapping to canonical mild symptoms
SYNONYM_MAP = {
    # Fever
    "high temperature": "fever",
    "feverish": "fever",
    "elevated temperature": "fever",
    "pyrexia": "fever",
    "chills": "fever",
    # Cough
    "coughing": "cough",
    "dry cough": "cough",
    "wet cough": "cough",
    "hacking cough": "cough",
    # Sore throat
    "throat ache": "sore throat",
    "scratchy throat": "sore throat",
    "pain swallowing": "sore throat",
    "pharyngitis": "sore throat",
    # Nasal congestion
    "runny nose": "nasal congestion",
    "blocked nose": "nasal congestion",
    "stuffy nose": "nasal congestion",
    "sneezing": "nasal congestion",
    "congestion": "nasal congestion",
    # Headache
    "head ache": "headache",
    "throbbing head": "headache",
    "head pain": "headache",
    # Fatigue
    "tiredness": "fatigue",
    "exhaustion": "fatigue",
    "lethargy": "fatigue",
    "weariness": "fatigue",
    # Abdominal pain
    "belly pain": "abdominal pain",
    "stomach ache": "abdominal pain",
    "tummy ache": "abdominal pain",
    "stomach cramps": "abdominal pain",
    "abdominal cramps": "abdominal pain",
    "gut pain": "abdominal pain",
    # Nausea
    "nauseous": "nausea",
    "feeling sick": "nausea",
    "queasy": "nausea",
    # Vomiting
    "throwing up": "vomiting",
    "puking": "vomiting",
    "emesis": "vomiting",
    # Diarrhea
    "diarrhoea": "diarrhea",
    "loose motions": "diarrhea",
    "loose stools": "diarrhea",
    "watery stool": "diarrhea",
    # Rash
    "skin rash": "rash",
    "skin breakout": "rash",
    "hives": "rash",
    "skin irritation": "rash",
    # Joint pain
    "joint ache": "joint pain",
    "aching joints": "joint pain",
    "arthralgia": "joint pain",
    # Back pain
    "back ache": "back pain",
    "lumbar pain": "back pain",
    "lower back pain": "back pain",
    # Body ache
    "body aches": "body ache",
    "muscle aches": "body ache",
    "muscle pain": "body ache",
    "myalgia": "body ache",
    "general aches": "body ache",
}

# Recognised mild symptoms and their clinical knowledge profiles
MILD_SYMPTOMS = {
    "fever": {
        "conditions": ["Viral Infection", "Common Cold", "Seasonal Influenza"],
        "specialisation": "General Physician",
        "advice": [
            "Stay well-hydrated with water, electrolyte drinks, or warm broths.",
            "Rest in a cool, well-ventilated room.",
            "Monitor body temperature regularly and note any peak spikes.",
        ],
    },
    "cough": {
        "conditions": ["Upper Respiratory Tract Infection", "Common Cold", "Acute Bronchitis"],
        "specialisation": "General Physician",
        "advice": [
            "Sip warm liquids such as herbal tea with honey or warm water.",
            "Avoid exposure to airborne irritants including smoke, dust, and cold air.",
            "Use steam inhalation to soothe airways.",
        ],
    },
    "sore throat": {
        "conditions": ["Viral Pharyngitis", "Tonsillitis", "Common Cold"],
        "specialisation": "General Physician",
        "advice": [
            "Gargle gently with warm salt water several times daily.",
            "Stay hydrated with soothing warm or cool non-citrus fluids.",
            "Rest your vocal cords and avoid throat-straining.",
        ],
    },
    "nasal congestion": {
        "conditions": ["Allergic Rhinitis", "Common Cold", "Acute Sinusitis"],
        "specialisation": "General Physician",
        "advice": [
            "Inhale steam or use a saline nasal rinse to relieve congestion.",
            "Keep the head elevated while resting to aid breathing comfort.",
            "Drink plenty of fluids to keep mucous membranes moist.",
        ],
    },
    "headache": {
        "conditions": ["Tension Headache", "Dehydration Headache", "Migraine"],
        "specialisation": "General Physician",
        "advice": [
            "Rest in a quiet, dark, well-ventilated room.",
            "Apply a cool or lukewarm compress across your forehead.",
            "Ensure adequate hydration and avoid prolonged screen time.",
        ],
    },
    "fatigue": {
        "conditions": ["Post-Viral Fatigue", "Physical Overexertion", "Sleep Deficiency"],
        "specialisation": "General Physician",
        "advice": [
            "Ensure 7 to 9 hours of restorative, uninterrupted sleep.",
            "Pace your daily activities and avoid strenuous physical exertion.",
            "Maintain balanced nutrition and regular hydration.",
        ],
    },
    "abdominal pain": {
        "conditions": ["Mild Dyspepsia", "Indigestion", "Irritable Bowel Discomfort"],
        "specialisation": "Gastroenterology",
        "advice": [
            "Avoid heavy, greasy, acidic, or highly spiced meals.",
            "Eat smaller, more frequent portions and remain upright after eating.",
            "Apply a gentle warm compress to the abdomen if comfortable.",
        ],
    },
    "nausea": {
        "conditions": ["Mild Gastritis", "Motion Discomfort", "Dietary Sensitivity"],
        "specialisation": "Gastroenterology",
        "advice": [
            "Eat small portions of bland foods such as dry toast, crackers, or rice.",
            "Sip clear liquids slowly throughout the day.",
            "Avoid strong food odors and avoid lying flat immediately after eating.",
        ],
    },
    "vomiting": {
        "conditions": ["Acute Gastroenteritis", "Food-Borne Illness"],
        "specialisation": "Gastroenterology",
        "advice": [
            "Take small, frequent sips of oral rehydration solution after vomiting pauses.",
            "Do not consume solid foods until your stomach has settled.",
            "Rest and avoid sudden body movements.",
        ],
    },
    "diarrhea": {
        "conditions": ["Acute Enteritis", "Dietary Indiscretion"],
        "specialisation": "Gastroenterology",
        "advice": [
            "Replenish lost fluids continuously with oral rehydration solutions.",
            "Follow a temporary bland diet (bananas, rice, applesauce, toast).",
            "Avoid caffeine, dairy products, and high-fat foods.",
        ],
    },
    "rash": {
        "conditions": ["Contact Dermatitis", "Mild Allergic Skin Reaction", "Eczematous Rash"],
        "specialisation": "Dermatology",
        "advice": [
            "Keep the affected skin clean, cool, and dry.",
            "Avoid scratching the skin to prevent secondary irritation or infection.",
            "Wear loose-fitting, breathable cotton clothing.",
        ],
    },
    "joint pain": {
        "conditions": ["Mild Arthralgia", "Physical Strain", "Overuse Discomfort"],
        "specialisation": "Orthopedics",
        "advice": [
            "Rest the affected joint and avoid high-impact activities.",
            "Apply a cool or warm compress depending on comfort.",
            "Support the joint in a neutral, relaxed position.",
        ],
    },
    "back pain": {
        "conditions": ["Musculoskeletal Lumbar Strain", "Postural Fatigue"],
        "specialisation": "Orthopedics",
        "advice": [
            "Maintain an ergonomic sitting posture with lower back support.",
            "Avoid heavy lifting, sudden bending, or twisting movements.",
            "Engage in gentle short walks if tolerable without pain.",
        ],
    },
    "body ache": {
        "conditions": ["Viral Prodrome", "Muscular Fatigue", "Common Cold"],
        "specialisation": "General Physician",
        "advice": [
            "Allow your body adequate downtime and quality rest.",
            "Take a warm shower or bath to relax tense muscles.",
            "Maintain consistent fluid intake.",
        ],
    },
}

# Negation words / phrases used to prevent false positive triggers
NEGATION_PREFIXES = (
    "no ",
    "not ",
    "denies ",
    "without ",
    "negative for ",
    "free of ",
    "does not have ",
    "doesn't have ",
    "did not have ",
    "never had ",
)
