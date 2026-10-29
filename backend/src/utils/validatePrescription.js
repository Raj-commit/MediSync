const AppError = require('./AppError');

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;
const FIELD_MAX_LEN = 200; // medicine, dosage
const INSTRUCTIONS_MAX_LEN = 500; // instructions
const MAX_ITEMS = 50;
const MIN_ITEMS = 1;
const ALLOWED_BODY_KEYS = ['appointmentId', 'items'];
const ALLOWED_ITEM_KEYS = ['medicine', 'dosage', 'instructions'];
const ALLOWED_QUERY_KEYS = ['page', 'limit', 'appointmentId'];
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/**
 * Validates a 24-character hex ObjectId route parameter.
 */
function validatePrescriptionId(id) {
  if (!id || typeof id !== 'string' || !OBJECT_ID_REGEX.test(id)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid prescription ID');
  }
  return id;
}

/**
 * Validates the body for creating a prescription.
 * Strict: rejects unexpected fields (e.g. client cannot inject patient/doctor names or issue dates).
 */
function validatePrescriptionInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object');
  }

  // Reject unexpected top-level fields
  for (const key of Object.keys(body)) {
    if (!ALLOWED_BODY_KEYS.includes(key)) {
      throw new AppError(400, 'VALIDATION_ERROR', `Unknown or forbidden field in request body: ${key}`);
    }
  }

  // appointmentId validation
  if (!body.appointmentId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'appointmentId is required');
  }
  if (typeof body.appointmentId !== 'string' || !OBJECT_ID_REGEX.test(body.appointmentId)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'appointmentId must be a valid 24-character hex ID');
  }
  const appointmentId = body.appointmentId;

  // items validation
  if (!body.items) {
    throw new AppError(400, 'VALIDATION_ERROR', 'items is required');
  }
  if (!Array.isArray(body.items)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'items must be an array');
  }
  if (body.items.length < MIN_ITEMS) {
    throw new AppError(400, 'VALIDATION_ERROR', 'At least one prescription item is required');
  }
  if (body.items.length > MAX_ITEMS) {
    throw new AppError(400, 'VALIDATION_ERROR', `Prescription cannot contain more than ${MAX_ITEMS} items`);
  }

  const sanitizedItems = [];
  for (let i = 0; i < body.items.length; i++) {
    const item = body.items[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new AppError(400, 'VALIDATION_ERROR', `Item at index ${i} must be an object`);
    }

    for (const key of Object.keys(item)) {
      if (!ALLOWED_ITEM_KEYS.includes(key)) {
        throw new AppError(400, 'VALIDATION_ERROR', `Unknown field "${key}" in item at index ${i}`);
      }
    }

    // medicine
    if (item.medicine === undefined || item.medicine === null) {
      throw new AppError(400, 'VALIDATION_ERROR', `Item at index ${i} must include "medicine"`);
    }
    if (typeof item.medicine !== 'string' || item.medicine.trim() === '') {
      throw new AppError(400, 'VALIDATION_ERROR', `"medicine" in item at index ${i} must not be blank`);
    }
    const trimmedMedicine = item.medicine.trim();
    if (trimmedMedicine.length > FIELD_MAX_LEN) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `"medicine" in item at index ${i} must be ${FIELD_MAX_LEN} characters or fewer`
      );
    }

    // dosage
    if (item.dosage === undefined || item.dosage === null) {
      throw new AppError(400, 'VALIDATION_ERROR', `Item at index ${i} must include "dosage"`);
    }
    if (typeof item.dosage !== 'string' || item.dosage.trim() === '') {
      throw new AppError(400, 'VALIDATION_ERROR', `"dosage" in item at index ${i} must not be blank`);
    }
    const trimmedDosage = item.dosage.trim();
    if (trimmedDosage.length > FIELD_MAX_LEN) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `"dosage" in item at index ${i} must be ${FIELD_MAX_LEN} characters or fewer`
      );
    }

    // instructions
    if (item.instructions === undefined || item.instructions === null) {
      throw new AppError(400, 'VALIDATION_ERROR', `Item at index ${i} must include "instructions"`);
    }
    if (typeof item.instructions !== 'string' || item.instructions.trim() === '') {
      throw new AppError(400, 'VALIDATION_ERROR', `"instructions" in item at index ${i} must not be blank`);
    }
    const trimmedInstructions = item.instructions.trim();
    if (trimmedInstructions.length > INSTRUCTIONS_MAX_LEN) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `"instructions" in item at index ${i} must be ${INSTRUCTIONS_MAX_LEN} characters or fewer`
      );
    }

    sanitizedItems.push({
      medicine: trimmedMedicine,
      dosage: trimmedDosage,
      instructions: trimmedInstructions,
    });
  }

  return {
    appointmentId,
    items: sanitizedItems,
  };
}

/**
 * Validates query parameters for GET /prescriptions.
 * Strictly rejects unknown query keys.
 */
function validatePrescriptionsQuery(query) {
  const q = query !== null && typeof query === 'object' && !Array.isArray(query) ? query : {};

  for (const key of Object.keys(q)) {
    if (!ALLOWED_QUERY_KEYS.includes(key)) {
      throw new AppError(400, 'VALIDATION_ERROR', `Unknown query parameter: ${key}`);
    }
  }

  let page = DEFAULT_PAGE;
  if (q.page !== undefined) {
    if (typeof q.page !== 'string' && typeof q.page !== 'number') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Page must be a positive integer');
    }
    const parsedPage = Number(q.page);
    if (!Number.isInteger(parsedPage) || parsedPage < 1) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Page must be a positive integer');
    }
    page = parsedPage;
  }

  let limit = DEFAULT_LIMIT;
  if (q.limit !== undefined) {
    if (typeof q.limit !== 'string' && typeof q.limit !== 'number') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Limit must be a positive integer');
    }
    const parsedLimit = Number(q.limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > MAX_LIMIT) {
      throw new AppError(400, 'VALIDATION_ERROR', `Limit must be between 1 and ${MAX_LIMIT}`);
    }
    limit = parsedLimit;
  }

  let appointmentId;
  if (q.appointmentId !== undefined) {
    if (typeof q.appointmentId !== 'string' || !OBJECT_ID_REGEX.test(q.appointmentId)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'appointmentId must be a valid 24-character hex ID');
    }
    appointmentId = q.appointmentId;
  }

  return { page, limit, appointmentId };
}

module.exports = {
  validatePrescriptionId,
  validatePrescriptionInput,
  validatePrescriptionsQuery,
};
