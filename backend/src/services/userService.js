const AppError = require('../utils/AppError');

// Formats a patient or doctor user document into the public profile representation.
// Admins have no profile and are forbidden. Never includes passwordHash or internal fields.
function serializeProfile(user) {
  const base = {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
  };

  if (user.role === 'patient') {
    const dob =
      user.dateOfBirth instanceof Date
        ? user.dateOfBirth.toISOString().slice(0, 10)
        : user.dateOfBirth
          ? new Date(user.dateOfBirth).toISOString().slice(0, 10)
          : null;

    return {
      ...base,
      dateOfBirth: dob,
      address: user.address,
    };
  }

  if (user.role === 'doctor') {
    return {
      ...base,
      specialisations: user.specialisations || [],
      qualification: user.qualification,
    };
  }

  throw new AppError(403, 'FORBIDDEN', 'You do not have permission to do this');
}

function getProfile(user) {
  return serializeProfile(user);
}

module.exports = {
  getProfile,
  serializeProfile,
};
