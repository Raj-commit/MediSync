const bcrypt = require('bcryptjs');
const { User, Patient, Doctor } = require('../models/User');
const AppError = require('../utils/AppError');
const toPublicUser = require('../utils/publicUser');
const validateRegister = require('../utils/validateRegister');
const { signToken } = require('../utils/token');

const BCRYPT_ROUNDS = 10;

// A real bcrypt hash of a throwaway text. When the email is unknown we still
// compare against it, so "unknown email" and "wrong password" take about the
// same time and an attacker cannot tell them apart.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

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

async function login(body) {
  const input = body !== null && typeof body === 'object' ? body : {};
  // Only strings are allowed. This also blocks NoSQL injection like
  // { "email": { "$gt": "" } }.
  if (typeof input.email !== 'string' || typeof input.password !== 'string' || !input.email.trim() || !input.password) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Email and password are required');
  }

  const email = input.email.trim().toLowerCase();
  // passwordHash is hidden by default, so ask for it on purpose here.
  const user = await User.findOne({ email }).select('+passwordHash');

  const passwordOk = await bcrypt.compare(input.password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !passwordOk) {
    // One generic error for both cases.
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  // Checked only after the password is correct, so strangers cannot find out
  // which accounts are disabled.
  if (!user.isActive) {
    throw new AppError(403, 'ACCOUNT_DISABLED', 'This account has been disabled');
  }

  return { token: signToken(user), user: toPublicUser(user) };
}

module.exports = { register, login };