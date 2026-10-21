const AppError = require('./AppError');

const PASSWORD_MIN = 8;
// bcrypt only uses the first 72 bytes of a password, so longer ones are refused.
const PASSWORD_MAX_BYTES = 72;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[0-9 -]+$/;
const DOB_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function fail(message) {
  throw new AppError(400, 'VALIDATION_ERROR', message);
}

// Every value must really be a string. This also stops NoSQL injection such as
// { "email": { "$gt": "" } }, because an object is never a string.
function requireString(value, label, maxLength) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`${label} is required`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    fail(`${label} must be at most ${maxLength} characters`);
  }
  return trimmed;
}

function parseDateOfBirth(value) {
  if (typeof value !== 'string' || !DOB_PATTERN.test(value.trim())) {
    fail('Date of birth must be a date in the format YYYY-MM-DD');
  }
  const text = value.trim();
  const date = new Date(`${text}T00:00:00.000Z`);
  // Rejects dates that do not exist, such as 2000-02-31.
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    fail('Date of birth is not a valid date');
  }
  if (date > new Date()) {
    fail('Date of birth cannot be in the future');
  }
  if (date.getUTCFullYear() < 1900) {
    fail('Date of birth is not a valid date');
  }
  return date;
}

// Returns a clean object with only the fields we accept. Anything else the
// client sends (for example isActive) is ignored.
function validateRegister(body) {
  const input = body !== null && typeof body === 'object' && !Array.isArray(body) ? body : {};

  if (input.role !== 'patient' && input.role !== 'doctor') {
    fail('Role must be patient or doctor');
  }

  const name = requireString(input.name, 'Name', 100);

  const email = requireString(input.email, 'Email', 254).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    fail('Enter a valid email address');
  }

  const phone = requireString(input.phone, 'Phone number', 20);
  const digits = phone.replace(/\D/g, '');
  if (!PHONE_PATTERN.test(phone) || digits.length < 7 || digits.length > 15) {
    fail('Enter a valid phone number');
  }

  const password = input.password;
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) {
    fail(`Password must be at least ${PASSWORD_MIN} characters`);
  }
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
    fail('Password is too long (maximum 72 bytes)');
  }

  const clean = { role: input.role, name, email, phone, password };

  if (input.role === 'patient') {
    clean.dateOfBirth = parseDateOfBirth(input.dateOfBirth);
    clean.address = requireString(input.address, 'Address', 300);
  } else {
    const list = input.specialisations;
    if (!Array.isArray(list) || list.length === 0 || list.length > 10) {
      fail('Enter between 1 and 10 specialisations');
    }
    clean.specialisations = list.map((item) => requireString(item, 'Each specialisation', 100));
    clean.qualification = requireString(input.qualification, 'Qualification', 200);
  }

  return clean;
}

module.exports = validateRegister;