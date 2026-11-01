const { User } = require('../models/User');
const AppError = require('../utils/AppError');
const {
  escapeRegex,
  validateAdminUsersQuery,
  validateUserId,
  validateUpdateStatusBody,
  toAdminUser,
} = require('../utils/validateAdmin');

const ADMIN_SAFE_PROJECTION =
  '_id name email phone role isActive createdAt specialisations qualification';

/**
 * Lists patient and doctor accounts with filtering, search, and pagination.
 * Admin accounts are strictly excluded.
 *
 * @param {object} queryParams - Express req.query
 * @returns {Promise<{ users: object[], pagination: object }>}
 */
async function listUsers(queryParams) {
  const { role, status, search, page, limit } = validateAdminUsersQuery(queryParams);

  // Exclude admin accounts; list patients and doctors only
  const filter = {
    role: { $in: ['patient', 'doctor'] },
  };

  if (role) {
    filter.role = role;
  }

  if (status !== undefined) {
    filter.isActive = status === 'active';
  }

  if (search) {
    const escaped = escapeRegex(search);
    filter.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { email: { $regex: escaped, $options: 'i' } },
    ];
  }

  const skip = (page - 1) * limit;

  const [total, users] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter)
      .select(ADMIN_SAFE_PROJECTION)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  const totalPages = Math.ceil(total / limit) || 0;

  return {
    users: users.map(toAdminUser),
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  };
}

/**
 * Updates a patient or doctor account's active status (activate or deactivate).
 * Atomic update restricted to patient and doctor roles only to prevent race modifications on admins.
 *
 * @param {string} targetUserId - Target user ObjectId string
 * @param {object} body - Request body { isActive: boolean }
 * @param {string} currentAdminId - Logged-in admin user ID
 * @returns {Promise<object>} Updated safe user object
 */
async function updateUserStatus(targetUserId, body, currentAdminId) {
  const validId = validateUserId(targetUserId);
  const { isActive } = validateUpdateStatusBody(body);

  // Prevent an admin from deactivating their own account
  if (currentAdminId && validId.toString() === currentAdminId.toString() && !isActive) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Admins cannot deactivate their own account');
  }

  // Atomic update: only patient or doctor accounts can be updated.
  // Querying on role inside findOneAndUpdate guarantees an admin account can never be touched.
  const updatedUser = await User.findOneAndUpdate(
    { _id: validId, role: { $in: ['patient', 'doctor'] } },
    { isActive },
    { returnDocument: 'after' }
  )
    .select(ADMIN_SAFE_PROJECTION)
    .lean();

  if (!updatedUser) {
    throw new AppError(404, 'NOT_FOUND', 'User not found');
  }

  return toAdminUser(updatedUser);
}

module.exports = {
  listUsers,
  updateUserStatus,
};
