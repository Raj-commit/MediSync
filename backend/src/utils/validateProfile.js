const AppError = require('./AppError');

const PHONE_PATTERN = /^\+?[0-9 -]+$/;
const DOB_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const PROTECTED_FIELDS = [
  'email',
  'password',
  'passwordHash',
  'role',
  'isActive',
  '_id',
  'id',
];

const PATIENT_CROSS_FIELDS = ['specialisations', 'qualification'];
const DOCTOR_CROSS_FIELDS = ['dateOfBirth', 'address'];

function fail(message) {
  throw new AppError(400, 'VALIDATION_ERROR', message);
}

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

function validatePhone(value) {
  const phone = requireString(value, 'Phone number', 20);
  const digits = phone.replace(/\D/g, '');
  if (!PHONE_PATTERN.test(phone) || digits.length < 7 || digits.length > 15) {
    fail('Enter a valid phone number');
  }
  return phone;
}

// Validates partial updates to a patient or doctor profile.
// Protects immutable fields (email, password, role, isActive).
// Prevents cross-role field updates (patients cannot set doctor fields and vice-versa).
function validateProfile(body, role) {
  const input =
    body !== null && typeof body === 'object' && !Array.isArray(body) ? body : null;

  if (!input) {
    fail('Request body must be a JSON object');
  }

  // 1. Protected fields check
  for (const field of PROTECTED_FIELDS) {
    if (input[field] !== undefined) {
      fail(`${field} cannot be changed`);
    }
  }

  // 2. Cross-role fields check
  if (role === 'patient') {
    for (const field of PATIENT_CROSS_FIELDS) {
      if (input[field] !== undefined) {
        fail(`${field} is not allowed for patient`);
      }
    }
  } else if (role === 'doctor') {
    for (const field of DOCTOR_CROSS_FIELDS) {
      if (input[field] !== undefined) {
        fail(`${field} is not allowed for doctor`);
      }
    }
  }

  const clean = {};

  // 3. Common editable fields
  if (input.name !== undefined) {
    clean.name = requireString(input.name, 'Name', 100);
  }

  if (input.phone !== undefined) {
    clean.phone = validatePhone(input.phone);
  }

  // 4. Role-specific editable fields
  if (role === 'patient') {
    if (input.dateOfBirth !== undefined) {
      clean.dateOfBirth = parseDateOfBirth(input.dateOfBirth);
    }
    if (input.address !== undefined) {
      clean.address = requireString(input.address, 'Address', 300);
    }
  } else if (role === 'doctor') {
    if (input.specialisations !== undefined) {
      const list = input.specialisations;
      if (!Array.isArray(list) || list.length === 0 || list.length > 10) {
        fail('Enter between 1 and 10 specialisations');
      }
      clean.specialisations = list.map((item) =>
        requireString(item, 'Each specialisation', 100)
      );
    }
    if (input.qualification !== undefined) {
      clean.qualification = requireString(input.qualification, 'Qualification', 200);
    }
  }

  // At least one valid editable field must be provided
  if (Object.keys(clean).length === 0) {
    fail('At least one field to update must be provided');
  }

  return clean;
}

module.exports = validateProfile;
