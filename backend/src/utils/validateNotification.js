const AppError = require('./AppError');

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;
const ALLOWED_QUERY_KEYS = ['status', 'page', 'limit'];
const ALLOWED_STATUSES = ['unread', 'read'];
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/**
 * Validates a notification ID parameter.
 */
function validateNotificationId(id) {
  if (!id || typeof id !== 'string' || !OBJECT_ID_REGEX.test(id)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid notification ID');
  }
  return id;
}

/**
 * Validates query parameters for GET /api/v1/notifications.
 */
function validateNotificationsQuery(query) {
  const q =
    query !== null && typeof query === 'object' && !Array.isArray(query) ? query : {};

  // Reject unexpected or bracketed parameters
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

  return { status, page, limit };
}

module.exports = {
  validateNotificationId,
  validateNotificationsQuery,
};
