const AppError = require('./AppError');

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;
const ALLOWED_QUERY_KEYS = ['limit', 'beforeSeq', 'afterSeq'];
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * Validates the appointment ID format in route parameters.
 */
function validateAppointmentId(id) {
  if (!id || typeof id !== 'string' || !OBJECT_ID_REGEX.test(id)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid appointment ID');
  }
  return id;
}

/**
 * Ensures no body is passed to GET requests.
 */
function validateEmptyBody(body) {
  if (body !== undefined && body !== null) {
    if (typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length > 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Request body is not allowed for this endpoint');
    }
  }
}

function parseInteger(val, fieldName, min, max) {
  if (typeof val !== 'string' && typeof val !== 'number') {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be an integer`);
  }
  const num = Number(val);
  if (!Number.isInteger(num)) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be an integer`);
  }
  if (min !== undefined && num < min) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be at least ${min}`);
  }
  if (max !== undefined && num > max) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be at most ${max}`);
  }
  return num;
}

/**
 * Validates query parameters for GET /api/v1/appointments/:id/messages.
 */
function validateChatMessagesQuery(query) {
  const q =
    query !== null && typeof query === 'object' && !Array.isArray(query) ? query : {};

  for (const key of Object.keys(q)) {
    if (!ALLOWED_QUERY_KEYS.includes(key)) {
      throw new AppError(400, 'VALIDATION_ERROR', `Unknown query parameter: ${key}`);
    }
  }

  let limit = DEFAULT_LIMIT;
  if (q.limit !== undefined) {
    limit = parseInteger(q.limit, 'Limit', 1, MAX_LIMIT);
  }

  let beforeSeq;
  if (q.beforeSeq !== undefined) {
    beforeSeq = parseInteger(q.beforeSeq, 'beforeSeq', 1);
  }

  let afterSeq;
  if (q.afterSeq !== undefined) {
    afterSeq = parseInteger(q.afterSeq, 'afterSeq', 0);
  }

  if (beforeSeq !== undefined && afterSeq !== undefined && beforeSeq <= afterSeq) {
    throw new AppError(400, 'VALIDATION_ERROR', 'beforeSeq must be greater than afterSeq');
  }

  return { limit, beforeSeq, afterSeq };
}

module.exports = {
  validateAppointmentId,
  validateEmptyBody,
  validateChatMessagesQuery,
};
