const rateLimit = require('express-rate-limit');
const AppError = require('../utils/AppError');

// Slows down password guessing (AGENTS.md section 8.4). Only failed logins are
// counted, so a real user who logs in correctly is never locked out.
function createLoginLimiter({ windowMs = 15 * 60 * 1000, limit = 10 } = {}) {
  return rateLimit({
    windowMs,
    limit,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // Send the error through our errorHandler so it has the { message, code } shape.
    handler: (req, res, next) => {
      next(new AppError(429, 'TOO_MANY_ATTEMPTS', 'Too many login attempts. Please try again later.'));
    },
  });
}

module.exports = { createLoginLimiter };