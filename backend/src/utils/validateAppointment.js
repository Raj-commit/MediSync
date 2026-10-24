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

module.exports = {
  validateAppointmentInput,
  parseIsoUtcDate,
};
