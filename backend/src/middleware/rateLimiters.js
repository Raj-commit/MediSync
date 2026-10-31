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

// Limits symptom check submissions to 10 requests per 15 minutes per authenticated patient.
// Must run AFTER authenticate and requireRole('patient') so req.user.id is available.
function createSymptomCheckLimiter({ windowMs = 15 * 60 * 1000, limit = 10 } = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    validate: { keyGeneratorIpFallback: false },
    keyGenerator: (req) => {
      return String(req.user?.id || req.user?._id || 'anonymous');
    },
    handler: (req, res, next) => {
      next(
        new AppError(
          429,
          'TOO_MANY_REQUESTS',
          'Too many symptom check requests. Please try again later.'
        )
      );
    },
  });
}

module.exports = { createLoginLimiter, createSymptomCheckLimiter };
