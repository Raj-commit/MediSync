const AppError = require("../utils/AppError");
const SymptomCheckResult = require("../models/SymptomCheckResult");
const { validateSymptomChecksQuery } = require("../utils/validateSymptomCheck");

const DJANGO_TIMEOUT_MS = 5000; // 5 seconds
const MAX_RESPONSE_BYTES = 65536; // 64 KiB

const MANDATORY_DISCLAIMER =
  "MediSync AI Symptom Checker provides preliminary informational guidance only. " +
  "It is not a medical diagnosis or treatment plan. Consult a qualified healthcare " +
  "professional for medical advice. Seek emergency assistance for severe or life-threatening symptoms.";

const VALID_URGENCY_LEVELS = ["emergency", "urgent", "routine"];

const VALID_SPECIALISATIONS = [
  "General Physician",
  "Cardiology",
  "Dermatology",
  "Neurology",
  "Orthopedics",
  "Pulmonology",
  "Gastroenterology",
  "Psychiatry",
  "Pediatrics",
  "Internal Medicine",
];

/**
 * Reads a response stream up to maxBytes. Rejects immediately if exceeded.
 *
 * @param {Response} response
 * @param {number} maxBytes
 * @returns {Promise<string>}
 */
async function readResponseBodyWithLimit(response, maxBytes) {
  if (response.body && typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    const chunks = [];
    let receivedBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          receivedBytes += value.byteLength || value.length;
          if (receivedBytes > maxBytes) {
            try {
              await reader.cancel("Response size limit exceeded");
            } catch (_) {}
            console.error(
              `Django symptom check response exceeded limit (${receivedBytes} > ${maxBytes} bytes)`,
            );
            throw new AppError(
              502,
              "SYMPTOM_SERVICE_UNAVAILABLE",
              "Symptom checker service is temporarily unavailable. Please try again later.",
            );
          }
          chunks.push(Buffer.from(value));
        }
      }
      return Buffer.concat(chunks).toString("utf-8");
    } catch (err) {
      if (err instanceof AppError) {
        throw err;
      }
      throw err;
    }
  }

  // Fallback for mocked environments or runtimes without getReader
  const rawText = await response.text();
  if (Buffer.byteLength(rawText, "utf-8") > maxBytes) {
    console.error(
      `Django symptom check response exceeded limit (${Buffer.byteLength(rawText, "utf-8")} > ${maxBytes} bytes)`,
    );
    throw new AppError(
      502,
      "SYMPTOM_SERVICE_UNAVAILABLE",
      "Symptom checker service is temporarily unavailable. Please try again later.",
    );
  }
  return rawText;
}

/**
 * Validates the parsed Django response against strict schema rules.
 * Maps validated snake_case fields to MongoDB camelCase structure.
 *
 * @param {any} data
 * @returns {{ assessment: string, possibleConditions: string[], urgencyLevel: string, suggestedSpecialisation: string, generalAdvice: string[], disclaimer: string }}
 */
function validateAndMapDjangoResponse(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    console.error("Django response is not a valid JSON object");
    throw new AppError(
      502,
      "SYMPTOM_SERVICE_UNAVAILABLE",
      "Symptom checker service is temporarily unavailable. Please try again later.",
    );
  }

  const requiredFields = [
    "assessment",
    "possible_conditions",
    "urgency_level",
    "suggested_specialisation",
    "general_advice",
    "disclaimer",
  ];

  for (const field of requiredFields) {
    if (data[field] === undefined || data[field] === null) {
      console.error(`Django response missing required field: "${field}"`);
      throw new AppError(
        502,
        "SYMPTOM_SERVICE_UNAVAILABLE",
        "Symptom checker service is temporarily unavailable. Please try again later.",
      );
    }
  }

  // assessment: non-empty string
  if (typeof data.assessment !== "string" || data.assessment.trim() === "") {
    console.error("Django response 'assessment' must be a non-empty string");
    throw new AppError(
      502,
      "SYMPTOM_SERVICE_UNAVAILABLE",
      "Symptom checker service is temporarily unavailable. Please try again later.",
    );
  }

  // possible_conditions: array of strings
  if (
    !Array.isArray(data.possible_conditions) ||
    !data.possible_conditions.every(
      (item) => typeof item === "string" && item.trim().length > 0,
    )
  ) {
    console.error(
      "Django response 'possible_conditions' must be an array of non-empty strings",
    );
    throw new AppError(
      502,
      "SYMPTOM_SERVICE_UNAVAILABLE",
      "Symptom checker service is temporarily unavailable. Please try again later.",
    );
  }

  // urgency_level: emergency, urgent, or routine
  if (!VALID_URGENCY_LEVELS.includes(data.urgency_level)) {
    console.error(
      `Django response 'urgency_level' invalid: "${data.urgency_level}"`,
    );
    throw new AppError(
      502,
      "SYMPTOM_SERVICE_UNAVAILABLE",
      "Symptom checker service is temporarily unavailable. Please try again later.",
    );
  }

  // suggested_specialisation: valid value from catalogue
  if (
    typeof data.suggested_specialisation !== "string" ||
    !VALID_SPECIALISATIONS.includes(data.suggested_specialisation.trim())
  ) {
    console.error(
      `Django response 'suggested_specialisation' invalid: "${data.suggested_specialisation}"`,
    );
    throw new AppError(
      502,
      "SYMPTOM_SERVICE_UNAVAILABLE",
      "Symptom checker service is temporarily unavailable. Please try again later.",
    );
  }

  // general_advice: array of strings
  if (
    !Array.isArray(data.general_advice) ||
    !data.general_advice.every(
      (item) => typeof item === "string" && item.trim().length > 0,
    )
  ) {
    console.error(
      "Django response 'general_advice' must be an array of non-empty strings",
    );
    throw new AppError(
      502,
      "SYMPTOM_SERVICE_UNAVAILABLE",
      "Symptom checker service is temporarily unavailable. Please try again later.",
    );
  }

  // disclaimer: non-empty string
  if (typeof data.disclaimer !== "string" || data.disclaimer.trim() === "") {
    console.error("Django response 'disclaimer' must be a non-empty string");
    throw new AppError(
      502,
      "SYMPTOM_SERVICE_UNAVAILABLE",
      "Symptom checker service is temporarily unavailable. Please try again later.",
    );
  }

  return {
    assessment: data.assessment.trim(),
    possibleConditions: data.possible_conditions.map((c) => c.trim()),
    urgencyLevel: data.urgency_level,
    suggestedSpecialisation: data.suggested_specialisation.trim(),
    generalAdvice: data.general_advice.map((a) => a.trim()),
    disclaimer: data.disclaimer.trim() || MANDATORY_DISCLAIMER,
  };
}

/**
 * Calls the internal Django microservice with symptoms and returns the validated assessment.
 *
 * Rules:
 * 1. Transmits ONLY the symptoms list. Never sends patient ID, name, or contact details.
 * 2. Authenticates via X-Service-Key header (never logged).
 * 3. Enforces 5-second timeout and 64 KiB payload limit.
 * 4. Maps all failures (network, HTTP non-200, malformed JSON, schema invalid) to 502.
 *
 * @param {string[]} symptoms
 * @returns {Promise<{ assessment: string, possibleConditions: string[], urgencyLevel: string, suggestedSpecialisation: string, generalAdvice: string[], disclaimer: string }>}
 */
async function callDjangoSymptomChecker(symptoms) {
  const baseUrl = (
    process.env.AI_SERVICE_URL || "http://localhost:8000"
  ).replace(/\/+$/, "");
  const serviceKey = process.env.AI_SERVICE_KEY;

  if (
    !serviceKey ||
    typeof serviceKey !== "string" ||
    serviceKey.trim() === ""
  ) {
    console.error(
      "Symptom checker misconfigured: AI_SERVICE_KEY is missing or empty.",
    );
    throw new AppError(
      502,
      "SYMPTOM_SERVICE_UNAVAILABLE",
      "Symptom checker service is temporarily unavailable. Please try again later.",
    );
  }

  const endpoint = `${baseUrl}/api/symptom-checker/check`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Key": serviceKey,
      },
      body: JSON.stringify({
        symptoms: symptoms.map((s) => String(s).trim()),
      }),
      signal: AbortSignal.timeout(DJANGO_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(
        `Django symptom checker returned non-success HTTP status: ${response.status}`,
      );
      throw new AppError(
        502,
        "SYMPTOM_SERVICE_UNAVAILABLE",
        "Symptom checker service is temporarily unavailable. Please try again later.",
      );
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      console.error(
        `Django symptom checker returned non-JSON content-type: "${contentType}"`,
      );
      throw new AppError(
        502,
        "SYMPTOM_SERVICE_UNAVAILABLE",
        "Symptom checker service is temporarily unavailable. Please try again later.",
      );
    }

    const responseText = await readResponseBodyWithLimit(
      response,
      MAX_RESPONSE_BYTES,
    );

    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch (parseErr) {
      console.error(
        "Django symptom checker returned invalid JSON:",
        parseErr.message,
      );
      throw new AppError(
        502,
        "SYMPTOM_SERVICE_UNAVAILABLE",
        "Symptom checker service is temporarily unavailable. Please try again later.",
      );
    }

    return validateAndMapDjangoResponse(parsed);
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }

    console.error(
      "Django symptom checker request failed:",
      err.message || err,
    );
    throw new AppError(
      502,
      "SYMPTOM_SERVICE_UNAVAILABLE",
      "Symptom checker service is temporarily unavailable. Please try again later.",
    );
  }
}

/**
 * Creates a new symptom check: calls Django, saves record, returns camelCase result.
 *
 * @param {string} patientId
 * @param {string[]} symptoms
 * @returns {Promise<Object>}
 */
async function createSymptomCheck(patientId, symptoms) {
  // 1. Call Django service
  const validatedAssessment = await callDjangoSymptomChecker(symptoms);

  // 2. Persist in MongoDB
  const record = await SymptomCheckResult.create({
    patient: patientId,
    symptomsInput: symptoms,
    aiAssessment: validatedAssessment,
    checkedAt: new Date(),
  });

  // 3. Return client response shape (camelCase)
  return {
    id: record._id.toString(),
    symptoms: record.symptomsInput,
    assessment: {
      assessment: record.aiAssessment.assessment,
      possibleConditions: record.aiAssessment.possibleConditions,
      urgencyLevel: record.aiAssessment.urgencyLevel,
      suggestedSpecialisation: record.aiAssessment.suggestedSpecialisation,
      generalAdvice: record.aiAssessment.generalAdvice,
      disclaimer: record.aiAssessment.disclaimer,
    },
    checkedAt: record.checkedAt.toISOString(),
  };
}

/**
 * Retrieves paginated symptom check history for the authenticated patient.
 *
 * @param {string} patientId
 * @param {Object} query
 * @returns {Promise<{ results: Object[], pagination: Object }>}
 */
async function getSymptomChecks(patientId, query) {
  const { page, limit } = validateSymptomChecksQuery(query);

  const filter = { patient: patientId };
  const skip = (page - 1) * limit;

  const [records, total] = await Promise.all([
    SymptomCheckResult.find(filter)
      .sort({ checkedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SymptomCheckResult.countDocuments(filter),
  ]);

  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

  const results = records.map((record) => ({
    id: record._id.toString(),
    symptoms: record.symptomsInput,
    assessment: {
      assessment: record.aiAssessment.assessment,
      possibleConditions: record.aiAssessment.possibleConditions || [],
      urgencyLevel: record.aiAssessment.urgencyLevel,
      suggestedSpecialisation: record.aiAssessment.suggestedSpecialisation,
      generalAdvice: record.aiAssessment.generalAdvice || [],
      disclaimer: record.aiAssessment.disclaimer,
    },
    checkedAt: record.checkedAt.toISOString(),
  }));

  return {
    results,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  };
}

module.exports = {
  callDjangoSymptomChecker,
  createSymptomCheck,
  getSymptomChecks,
  validateAndMapDjangoResponse,
  readResponseBodyWithLimit,
  DJANGO_TIMEOUT_MS,
  MAX_RESPONSE_BYTES,
  MANDATORY_DISCLAIMER,
  VALID_URGENCY_LEVELS,
  VALID_SPECIALISATIONS,
};
