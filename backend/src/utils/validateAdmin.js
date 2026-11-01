const AppError = require('./AppError');

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;
const ALLOWED_QUERY_KEYS = ['role', 'status', 'search', 'page', 'limit'];
const ALLOWED_ROLES = ['patient', 'doctor'];
const ALLOWED_STATUSES = ['active', 'inactive'];
const MAX_SEARCH_LENGTH = 100;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/**
 * Escapes special regex characters so user input is treated as literal search text.
 * Reuses the exact escape pattern from doctorService.js.
 *
 * @param {string} text
 * @returns {string} Escaped text safe for RegExp
 */
function escapeRegex(text) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

/**
 * Validates query parameters for GET /api/v1/admin/users.
 *
 * @param {object} query - Express req.query
 * @returns {{ role?: string, status?: string, search?: string, page: number, limit: number }}
 */
function validateAdminUsersQuery(query) {
  const q =
    query !== null && typeof query === 'object' && !Array.isArray(query) ? query : {};

  // Reject unexpected or bracketed parameters (e.g. search[$gt])
  for (const key of Object.keys(q)) {
    if (!ALLOWED_QUERY_KEYS.includes(key)) {
      throw new AppError(400, 'VALIDATION_ERROR', `Unknown query parameter: ${key}`);
    }
  }

  let role;
  if (q.role !== undefined) {
    if (typeof q.role !== 'string' || !ALLOWED_ROLES.includes(q.role)) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `role must be one of: ${ALLOWED_ROLES.join(', ')}`
      );
    }
    role = q.role;
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

  let search;
  if (q.search !== undefined) {
    if (typeof q.search !== 'string') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Search query must be a single string');
    }
    const trimmed = q.search.trim();
    if (trimmed.length > MAX_SEARCH_LENGTH) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `Search query must be at most ${MAX_SEARCH_LENGTH} characters`
      );
    }
    if (trimmed.length > 0) {
      search = trimmed;
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
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `Limit must be between 1 and ${MAX_LIMIT}`
      );
    }
    limit = parsedLimit;
  }

  return { role, status, search, page, limit };
}

/**
 * Validates a 24-character hex MongoDB ObjectId string for user parameters.
 *
 * @param {string} id
 * @returns {string}
 */
function validateUserId(id) {
  if (!id || typeof id !== 'string' || !OBJECT_ID_REGEX.test(id)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid user ID');
  }
  return id;
}

/**
 * Validates the body for PATCH /api/v1/admin/users/:id.
 * Must contain exactly { isActive: boolean } where isActive is a real boolean.
 *
 * @param {object} body
 * @returns {{ isActive: boolean }}
 */
function validateUpdateStatusBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object');
  }

  const keys = Object.keys(body);
  if (keys.length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'isActive field is required');
  }

  for (const key of keys) {
    if (key !== 'isActive') {
      throw new AppError(400, 'VALIDATION_ERROR', `Unknown field: ${key}`);
    }
  }

  if (typeof body.isActive !== 'boolean') {
    throw new AppError(400, 'VALIDATION_ERROR', 'isActive must be a boolean (true or false)');
  }

  return { isActive: body.isActive };
}

/**
 * Formats a user document into the approved safe Admin response shape.
 * Strips passwordHash, dateOfBirth, address, and any medical/internal data.
 *
 * @param {object} user
 * @returns {object} Safe admin-visible user object
 */
function toAdminUser(user) {
  const formatted = {
    id: user._id ? user._id.toString() : user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };

  if (user.role === 'doctor') {
    formatted.specialisations = Array.isArray(user.specialisations)
      ? user.specialisations
      : [];
    formatted.qualification = user.qualification || '';
  }

  return formatted;
}

module.exports = {
  escapeRegex,
  validateAdminUsersQuery,
  validateUserId,
  validateUpdateStatusBody,
  toAdminUser,
};
