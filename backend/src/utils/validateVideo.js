const AppError = require('./AppError');

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;
const MAX_SDP_LENGTH = 65536; // 64 KB
const MAX_CANDIDATE_LENGTH = 2048; // 2 KB
const MAX_SDP_MID_LENGTH = 128;

/**
 * Validates the appointment ID format in route parameters or socket payloads.
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

/**
 * Validates SDP offer/answer payload format and size limits.
 *
 * @param {object} data - Incoming payload
 * @param {'offer'|'answer'} expectedType
 * @returns {{ appointmentId: string, sdp: string, type: string }}
 */
function validateSdpPayload(data, expectedType) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid payload object');
  }

  const appointmentId = validateAppointmentId(data.appointmentId);

  // Extract sdp and type from either top-level or nested { offer } / { answer }
  const nested = expectedType === 'offer' ? data.offer : data.answer;
  const sdp = data.sdp || nested?.sdp;
  const type = data.type || nested?.type || expectedType;

  if (typeof sdp !== 'string' || sdp.trim() === '') {
    throw new AppError(400, 'VALIDATION_ERROR', 'Session description (SDP) is required');
  }

  if (sdp.length > MAX_SDP_LENGTH) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `Session description exceeds maximum length of ${MAX_SDP_LENGTH} characters`
    );
  }

  if (type !== expectedType) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `Expected SDP type "${expectedType}" but received "${type}"`
    );
  }

  // Reject unexpected keys
  const allowedKeys = ['appointmentId', 'sdp', 'type', 'offer', 'answer'];
  for (const key of Object.keys(data)) {
    if (!allowedKeys.includes(key)) {
      throw new AppError(400, 'VALIDATION_ERROR', `Unknown payload property: ${key}`);
    }
  }

  return { appointmentId, sdp: sdp.trim(), type };
}

/**
 * Validates WebRTC ICE candidate payload format and size limits.
 *
 * @param {object} data - Incoming payload
 * @returns {{ appointmentId: string, candidate: object }}
 */
function validateCandidatePayload(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid payload object');
  }

  const appointmentId = validateAppointmentId(data.appointmentId);

  if (!data.candidate || typeof data.candidate !== 'object') {
    throw new AppError(400, 'VALIDATION_ERROR', 'ICE candidate object is required');
  }

  const { candidate, sdpMid, sdpMLineIndex } = data.candidate;

  if (typeof candidate !== 'string' || candidate.trim() === '') {
    throw new AppError(400, 'VALIDATION_ERROR', 'ICE candidate string is required');
  }

  if (candidate.length > MAX_CANDIDATE_LENGTH) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `ICE candidate exceeds maximum length of ${MAX_CANDIDATE_LENGTH} characters`
    );
  }

  if (sdpMid !== undefined && sdpMid !== null) {
    if (typeof sdpMid !== 'string' || sdpMid.length > MAX_SDP_MID_LENGTH) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid sdpMid property');
    }
  }

  if (sdpMLineIndex !== undefined && sdpMLineIndex !== null) {
    if (
      typeof sdpMLineIndex !== 'number' ||
      !Number.isInteger(sdpMLineIndex) ||
      sdpMLineIndex < 0
    ) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid sdpMLineIndex property');
    }
  }

  // Reject unexpected top-level keys
  const allowedKeys = ['appointmentId', 'candidate'];
  for (const key of Object.keys(data)) {
    if (!allowedKeys.includes(key)) {
      throw new AppError(400, 'VALIDATION_ERROR', `Unknown payload property: ${key}`);
    }
  }

  return {
    appointmentId,
    candidate: {
      candidate: candidate.trim(),
      sdpMid: sdpMid !== undefined ? sdpMid : null,
      sdpMLineIndex: sdpMLineIndex !== undefined ? sdpMLineIndex : null,
    },
  };
}

module.exports = {
  OBJECT_ID_REGEX,
  MAX_SDP_LENGTH,
  MAX_CANDIDATE_LENGTH,
  MAX_SDP_MID_LENGTH,
  validateAppointmentId,
  validateEmptyBody,
  validateNoQuery,
  validateSdpPayload,
  validateCandidatePayload,
};
