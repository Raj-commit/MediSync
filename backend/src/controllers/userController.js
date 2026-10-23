const userService = require('../services/userService');

// GET /api/v1/users/me
// Returns the profile of the currently authenticated patient or doctor.
function getProfile(req, res) {
  const profile = userService.getProfile(req.user);
  res.json({ user: profile });
}

module.exports = {
  getProfile,
};
