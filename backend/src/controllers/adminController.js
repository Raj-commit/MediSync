const adminService = require('../services/adminService');

/**
 * GET /api/v1/admin/users
 * Lists patient and doctor accounts with optional filters and pagination.
 */
async function getUsers(req, res) {
  res.set('Cache-Control', 'no-store');
  const result = await adminService.listUsers(req.query);
  res.json(result);
}

/**
 * PATCH /api/v1/admin/users/:id
 * Activates or deactivates a patient or doctor account.
 */
async function patchUserStatus(req, res) {
  res.set('Cache-Control', 'no-store');
  const user = await adminService.updateUserStatus(
    req.params.id,
    req.body,
    req.user?._id || req.user?.id
  );
  res.json({ user });
}

module.exports = {
  getUsers,
  patchUserStatus,
};
