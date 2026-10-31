const AppError = require("./AppError");

const MIN_SYMPTOMS = 1;
const MAX_SYMPTOMS = 10;
const MAX_SYMPTOM_LENGTH = 100;
const ALLOWED_BODY_KEYS = ["symptoms"];
const ALLOWED_QUERY_KEYS = ["page", "limit"];
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/**
 * Validates patient symptom check submission body.
 *
 * Rules & security:
 * 1. Must be a plain JSON object.
 * 2. Strict key allowlist: ONLY 'symptoms' is permitted.
 *    Any injected fields (patient, id, assessment, etc.) are strictly rejected with 400.
 * 3. 'symptoms' must be an array with 1 to 10 strings.
 * 4. Each symptom must be a non-empty string of at most 100 characters.
 * 5. Returns trimmed symptoms.
 *
 * @param {any} body
 * @returns {{ symptoms: string[] }}
 */
function validateSymptomCheckInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Request body must be a JSON object",
    );
  }

  // Reject unexpected or forbidden fields (blocks injection of patient ID, results, etc.)
  for (const key of Object.keys(body)) {
    if (!ALLOWED_BODY_KEYS.includes(key)) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        `Unknown or forbidden field in request body: ${key}`,
      );
    }
  }

  if (body.symptoms === undefined || body.symptoms === null) {
    throw new AppError(400, "VALIDATION_ERROR", "symptoms is required");
  }

  if (!Array.isArray(body.symptoms)) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "symptoms must be an array of strings",
    );
  }

  if (body.symptoms.length < MIN_SYMPTOMS) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "At least one symptom is required",
    );
  }

  if (body.symptoms.length > MAX_SYMPTOMS) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `At most ${MAX_SYMPTOMS} symptoms are allowed`,
    );
  }

  const cleaned = [];
  for (let i = 0; i < body.symptoms.length; i++) {
    const item = body.symptoms[i];
    if (typeof item !== "string") {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "Each symptom must be a string",
      );
    }

    const trimmed = item.trim();
    if (trimmed.length === 0) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "Each symptom must not be blank",
      );
    }

    if (trimmed.length > MAX_SYMPTOM_LENGTH) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        `Each symptom must be ${MAX_SYMPTOM_LENGTH} characters or fewer`,
      );
    }

    cleaned.push(trimmed);
  }

  return { symptoms: cleaned };
}

/**
 * Validates query parameters for GET /api/v1/symptom-checks (patient history).
 *
 * @param {any} query
 * @returns {{ page: number, limit: number }}
 */
function validateSymptomChecksQuery(query) {
  const q =
    query !== null && typeof query === "object" && !Array.isArray(query)
      ? query
      : {};

  for (const key of Object.keys(q)) {
    if (!ALLOWED_QUERY_KEYS.includes(key)) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        `Unknown query parameter: ${key}`,
      );
    }
  }

  let page = DEFAULT_PAGE;
  if (q.page !== undefined) {
    if (typeof q.page !== "string" && typeof q.page !== "number") {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "Page must be a positive integer",
      );
    }
    const parsedPage = Number(q.page);
    if (!Number.isInteger(parsedPage) || parsedPage < 1) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "Page must be a positive integer",
      );
    }
    page = parsedPage;
  }

  let limit = DEFAULT_LIMIT;
  if (q.limit !== undefined) {
    if (typeof q.limit !== "string" && typeof q.limit !== "number") {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "Limit must be a positive integer",
      );
    }
    const parsedLimit = Number(q.limit);
    if (
      !Number.isInteger(parsedLimit) ||
      parsedLimit < 1 ||
      parsedLimit > MAX_LIMIT
    ) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        `Limit must be between 1 and ${MAX_LIMIT}`,
      );
    }
    limit = parsedLimit;
  }

  return { page, limit };
}

module.exports = {
  MIN_SYMPTOMS,
  MAX_SYMPTOMS,
  MAX_SYMPTOM_LENGTH,
  validateSymptomCheckInput,
  validateSymptomChecksQuery,
};
