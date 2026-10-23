const userService = require('../services/userService');

// GET /api/v1/users/me
// Returns the profile of the currently authenticated patient or doctor.
function getProfile(req, res) {
  const profile = userService.getProfile(req.user);
  res.json({ user: profile });
}

// PUT /api/v1/users/me
// Updates the editable profile fields of the authenticated patient or doctor.
async function updateProfile(req, res) {
  const profile = await userService.updateProfile(req.user, req.body);
  res.json({ user: profile });
}

module.exports = {
  getProfile,
  updateProfile,
};
