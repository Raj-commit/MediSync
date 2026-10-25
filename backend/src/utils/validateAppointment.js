const AppError = require('./AppError');

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;
const ISO_UTC_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/**
 * Validates an ISO 8601 UTC date string.
 * Rejects numbers, objects, arrays, and impossible calendar dates.
 */
function parseIsoUtcDate(val, fieldName) {
  if (typeof val !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be an ISO 8601 UTC string`);
  }
  if (!ISO_UTC_REGEX.test(val)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} must be an ISO 8601 string in UTC (e.g. 2026-11-02T04:30:00.000Z)`
    );
  }
  const d = new Date(val);
  if (isNaN(d.getTime())) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} is an invalid date`);
  }
  const isoString = d.toISOString();
  const normalizedInput = val.includes('.')
    ? val.replace(/\.(\d+)Z$/, (m, ms) => `.${ms.padEnd(3, '0').slice(0, 3)}Z`)
    : val.replace(/Z$/, '.000Z');

  if (isoString !== normalizedInput) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} contains an impossible calendar date`);
  }
  return d;
}

/**
 * Validates appointment booking request input.
 * Expects an object containing { doctorId, slotId }.
 * Rejects client-supplied patientId and status to prevent privilege escalation.
 */
function validateAppointmentInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Request body must be an object');
  }

  // Reject patientId and status if supplied by client
  if (body.patientId !== undefined) {
    throw new AppError(400, 'VALIDATION_ERROR', 'patientId is not allowed in request body');
  }
  if (body.status !== undefined) {
    throw new AppError(400, 'VALIDATION_ERROR', 'status is not allowed in request body');
  }

  // Reject unexpected keys
  const ALLOWED_KEYS = ['doctorId', 'slotId', 'startTime'];
  for (const key of Object.keys(body)) {
    if (!ALLOWED_KEYS.includes(key)) {
      throw new AppError(400, 'VALIDATION_ERROR', `Unknown field: ${key}`);
    }
  }

  // doctorId validation
  if (!body.doctorId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'doctorId is required');
  }
  if (typeof body.doctorId !== 'string' || !OBJECT_ID_REGEX.test(body.doctorId)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid doctor ID');
  }

  // slotId validation
  if (!body.slotId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'slotId is required');
  }
  if (typeof body.slotId !== 'string' || !OBJECT_ID_REGEX.test(body.slotId)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid slot ID');
  }

  // Optional startTime validation if provided
  let parsedStartTime;
  if (body.startTime !== undefined) {
    parsedStartTime = parseIsoUtcDate(body.startTime, 'startTime');
    if (parsedStartTime.getTime() <= Date.now()) {
      throw new AppError(400, 'VALIDATION_ERROR', 'startTime must be in the future');
    }
  }

  return {
    doctorId: body.doctorId,
    slotId: body.slotId,
    startTime: parsedStartTime,
  };
}

const ALLOWED_QUERY_KEYS = ['status', 'when', 'page', 'limit'];
const ALLOWED_STATUSES = ['requested', 'confirmed', 'completed', 'cancelled'];
const ALLOWED_WHEN = ['upcoming', 'past'];
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/**
 * Validates query parameters for appointment history.
 * Protects against unexpected keys, invalid status/when values, and bad pagination parameters.
 */
function validateAppointmentsQuery(query) {
  const q =
    query !== null && typeof query === 'object' && !Array.isArray(query) ? query : {};

  for (const key of Object.keys(q)) {
    if (!ALLOWED_QUERY_KEYS.includes(key)) {
      throw new AppError(400, 'VALIDATION_ERROR', `Unknown query parameter: ${key}`);
    }
  }

  let status;
  if (q.status !== undefined) {
    if (typeof q.status !== 'string' || !ALLOWED_STATUSES.includes(q.status)) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `status must be one of: ${ALLOWED_STATUSES.join(', ')}`
      );
    }
    status = q.status;
  }

  let when;
  if (q.when !== undefined) {
    if (typeof q.when !== 'string' || !ALLOWED_WHEN.includes(q.when)) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `when must be one of: ${ALLOWED_WHEN.join(', ')}`
      );
    }
    when = q.when;
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
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `Limit must be between 1 and ${MAX_LIMIT}`
      );
    }
    limit = parsedLimit;
  }

  return { status, when, page, limit };
}

const ALLOWED_ACTIONS = ['cancel', 'reschedule', 'accept', 'reject', 'complete'];

/**
 * Validates a 24-character hexadecimal ObjectId for appointment routing.
 */
function validateAppointmentId(id) {
  if (typeof id !== 'string' || !OBJECT_ID_REGEX.test(id)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid appointment ID');
  }
  return id;
}

/**
 * Validates action body for PATCH /api/v1/appointments/:id.
 * Supported actions: cancel, reschedule, accept, reject, complete.
 */
function validateAppointmentAction(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Request body must be an object');
  }

  const { action, slotId, ...rest } = body;
  if (!action || typeof action !== 'string' || !ALLOWED_ACTIONS.includes(action)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `action must be one of: ${ALLOWED_ACTIONS.join(', ')}`
    );
  }

  const extraKeys = Object.keys(rest);
  if (extraKeys.length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', `Unknown field: ${extraKeys[0]}`);
  }

  if (action === 'reschedule') {
    if (!slotId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'slotId is required for reschedule');
    }
    if (typeof slotId !== 'string' || !OBJECT_ID_REGEX.test(slotId)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid slot ID');
    }
    return { action, slotId };
  }

  if (slotId !== undefined) {
    throw new AppError(400, 'VALIDATION_ERROR', `slotId is not allowed for action "${action}"`);
  }

  return { action };
}

module.exports = {
  validateAppointmentId,
  validateAppointmentAction,
  validateAppointmentsQuery,
  validateAppointmentInput,
  parseIsoUtcDate,
};
