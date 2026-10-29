const AppError = require('./AppError');

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

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

/**
 * Ensures no unexpected query parameters are passed to GET /appointments/:id/video.
 */
function validateNoQuery(query) {
  if (query && typeof query === 'object' && Object.keys(query).length > 0) {
    const unknownKey = Object.keys(query)[0];
    throw new AppError(400, 'VALIDATION_ERROR', `Unknown query parameter: ${unknownKey}`);
  }
}

module.exports = {
  validateAppointmentId,
  validateEmptyBody,
  validateNoQuery,
};
