const AppError = require('./AppError');

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;
const ALLOWED_QUERY_KEYS = ['page', 'limit'];
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/**
 * Validates a patient ObjectId route parameter.
 */
function validatePatientId(id) {
  if (!id || typeof id !== 'string' || !OBJECT_ID_REGEX.test(id)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid patient ID');
  }
  return id;
}

/**
 * Validates query parameters for medical records listing.
 * Strictly rejects unknown query keys and bracketed parameters.
 */
function validateRecordsQuery(query) {
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

  return { page, limit };
}

/**
 * Validates that no unexpected body is passed to endpoints that do not take a body.
 */
function validateEmptyBody(body) {
  if (body !== undefined && body !== null) {
    if (typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length > 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Request body is not allowed for this endpoint');
    }
  }
}

/**
 * Validates input for adding a new medical record entry.
 * Rejects unknown fields, client-supplied timestamps or author IDs,
 * and enforces string lengths (diagnosis: 1-300 chars, notes: 1-3,000 chars).
 */
function validateEntryInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Request body must be an object');
  }

  const allowedKeys = ['diagnosis', 'notes'];
  for (const key of Object.keys(body)) {
    if (!allowedKeys.includes(key)) {
      throw new AppError(400, 'VALIDATION_ERROR', `Unknown or forbidden field in request body: ${key}`);
    }
  }

  if (body.diagnosis === undefined || body.diagnosis === null) {
    throw new AppError(400, 'VALIDATION_ERROR', 'diagnosis is required');
  }
  if (typeof body.diagnosis !== 'string' || body.diagnosis.trim() === '') {
    throw new AppError(400, 'VALIDATION_ERROR', 'diagnosis must be a non-empty string');
  }
  const trimmedDiagnosis = body.diagnosis.trim();
  if (trimmedDiagnosis.length > 300) {
    throw new AppError(400, 'VALIDATION_ERROR', 'diagnosis must not exceed 300 characters');
  }

  if (body.notes === undefined || body.notes === null) {
    throw new AppError(400, 'VALIDATION_ERROR', 'notes is required');
  }
  if (typeof body.notes !== 'string' || body.notes.trim() === '') {
    throw new AppError(400, 'VALIDATION_ERROR', 'notes must be a non-empty string');
  }
  const trimmedNotes = body.notes.trim();
  if (trimmedNotes.length > 3000) {
    throw new AppError(400, 'VALIDATION_ERROR', 'notes must not exceed 3,000 characters');
  }

  return {
    diagnosis: trimmedDiagnosis,
    notes: trimmedNotes,
  };
}

module.exports = {
  validatePatientId,
  validateRecordsQuery,
  validateEmptyBody,
  validateEntryInput,
};
