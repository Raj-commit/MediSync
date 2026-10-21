const bcrypt = require('bcryptjs');
const { User, Patient, Doctor } = require('../models/User');
const AppError = require('../utils/AppError');
const toPublicUser = require('../utils/publicUser');
const validateRegister = require('../utils/validateRegister');

const BCRYPT_ROUNDS = 10;

function emailTaken() {
  return new AppError(409, 'EMAIL_TAKEN', 'Email already registered');
}

async function register(body) {
  const data = validateRegister(body);

  // Friendly early check. The unique index below still protects us if two
  // requests with the same email arrive at the same moment.
  const existing = await User.exists({ email: data.email });
  if (existing) {
    throw emailTaken();
  }

  const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

  const common = {
    name: data.name,
    email: data.email,
    phone: data.phone,
    passwordHash,
  };

  try {
    // Patients and doctors are active immediately (isActive defaults to true).
    // The role is chosen by which model we use, never copied into an admin.
    const user =
      data.role === 'patient'
        ? await Patient.create({
            ...common,
            dateOfBirth: data.dateOfBirth,
            address: data.address,
          })
        : await Doctor.create({
            ...common,
            specialisations: data.specialisations,
            qualification: data.qualification,
          });
    return toPublicUser(user);
  } catch (err) {
    // 11000 is MongoDB's "duplicate key" error code.
    if (err && err.code === 11000) {
      throw emailTaken();
    }
    throw err;
  }
}

module.exports = { register };