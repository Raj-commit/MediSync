const mongoose = require('mongoose');

// One "users" collection. The `role` field tells the three kinds of user apart
// (Mongoose calls this a discriminator).
const ROLES = ['patient', 'doctor', 'admin'];

// Used by toJSON below: whenever a user is turned into JSON, drop the secret
// and internal fields so they can never leak by accident.
function hideSecrets(doc, ret) {
  delete ret.passwordHash;
  delete ret.__v;
  return ret;
}

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    phone: { type: String, required: true, trim: true },
    // select: false means normal queries do not load it. Login will ask for it
    // on purpose with .select('+passwordHash').
    passwordHash: { type: String, required: true, select: false },
    isActive: { type: Boolean, default: true },
    // Set automatically by Patient, Doctor and Admin below. Declared here so a
    // plain User with any other role is rejected.
    role: { type: String, required: true, enum: ROLES },
  },
  {
    discriminatorKey: 'role',
    timestamps: true,
    toJSON: { transform: hideSecrets },
    toObject: { transform: hideSecrets },
  }
);

const User = mongoose.model('User', userSchema);

const Patient = User.discriminator(
  'Patient',
  new mongoose.Schema({
    // age is derived from this, never stored (AGENTS.md section 5)
    dateOfBirth: { type: Date, required: true },
    address: { type: String, required: true, trim: true },
  }),
  'patient'
);

const Doctor = User.discriminator(
  'Doctor',
  new mongoose.Schema({
    specialisations: {
      type: [{ type: String, trim: true }],
      validate: {
        validator: (list) => list.length > 0 && list.every((s) => s.length > 0),
        message: 'specialisations must contain at least one non-empty value',
      },
    },
    qualification: { type: String, required: true, trim: true },
  }),
  'doctor'
);

// Admin has no extra fields. It is only created by the seed script.
const Admin = User.discriminator('Admin', new mongoose.Schema({}), 'admin');

module.exports = { User, Patient, Doctor, Admin, ROLES };