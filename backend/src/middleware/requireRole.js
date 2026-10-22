const { ROLES } = require('../models/User');
const AppError = require('../utils/AppError');

// Usage on a route: router.get('/x', authenticate, requireRole('doctor'), handler)
// It must come AFTER authenticate, which sets req.user from the database.
function requireRole(...roles) {
  // Runs once when the route is defined, so a typo is found at startup.
  if (roles.length === 0 || !roles.every((role) => ROLES.includes(role))) {
    throw new Error(`requireRole needs one or more of: ${ROLES.join(', ')}`);
  }

  return (req, res, next) => {
    // authenticate was forgotten or failed: deny instead of letting through.
    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'Please log in to continue');
    }
    if (!roles.includes(req.user.role)) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission to do this');
    }
    next();
  };
}

module.exports = { requireRole };