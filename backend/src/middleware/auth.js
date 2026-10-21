const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { User } = require('../models/User');
const AppError = require('../utils/AppError');
const { verifyToken } = require('../utils/token');

// The messages are shown to the user as written, so they stay simple and safe.
function invalidToken() {
  return new AppError(401, 'INVALID_TOKEN', 'Your session is no longer valid. Please log in again.');
}

// Checks, in order (AGENTS.md section 3, rule 4): valid JWT first. Role and
// ownership checks come later, in requireRole and in each feature.
// Express 5 sends errors thrown here to the errorHandler by itself.
async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  const match = typeof header === 'string' ? /^Bearer\s+(\S+)$/i.exec(header.trim()) : null;
  if (!match) {
    throw new AppError(401, 'UNAUTHORIZED', 'Please log in to continue');
  }

  let payload;
  try {
    payload = verifyToken(match[1]);
  } catch (err) {
    // Fake, changed or expired token. Anything else (for example a missing
    // JWT_SECRET) is a real server problem and is allowed to become a 500.
    if (err instanceof jwt.JsonWebTokenError) {
      throw invalidToken();
    }
    throw err;
  }

  // The id must be a real 24-character id. Checking first means a strange value
  // can never reach the database query.
  if (typeof payload.sub !== 'string' || !mongoose.isObjectIdOrHexString(payload.sub)) {
    throw invalidToken();
  }

  // The role always comes from the database, never from the token.
  const user = await User.findById(payload.sub);
  if (!user) {
    throw invalidToken();
  }
  if (!user.isActive) {
    throw new AppError(403, 'ACCOUNT_DISABLED', 'This account has been disabled');
  }

  req.user = user;
  next();
}

module.exports = { authenticate };