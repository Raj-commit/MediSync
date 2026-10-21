// Creates the first admin account from environment variables.
// Run it from the backend folder:  node scripts/seed-admin.js
// Safe to run again: if the admin already exists, nothing is changed.
const path = require('path');
// Load backend/.env no matter which folder the command is run from.
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const { User, Admin } = require('../src/models/User');

const BCRYPT_ROUNDS = 10; // same as registration
const PASSWORD_MIN = 8;
const PASSWORD_MAX_BYTES = 72; // bcrypt ignores everything after 72 bytes
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// The User model needs a phone for everyone. Used only when ADMIN_PHONE is empty.
const DEFAULT_PHONE = '+910000000000';

// Reads and checks the settings. Never prints the password.
function readSettings() {
  const name = (process.env.ADMIN_NAME || '').trim();
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  const phone = (process.env.ADMIN_PHONE || '').trim() || DEFAULT_PHONE;

  const problems = [];
  if (!name) problems.push('ADMIN_NAME is not set');
  if (!EMAIL_PATTERN.test(email)) problems.push('ADMIN_EMAIL is missing or not a valid email');
  if (password.length < PASSWORD_MIN) {
    problems.push(`ADMIN_PASSWORD must be at least ${PASSWORD_MIN} characters`);
  } else if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
    problems.push('ADMIN_PASSWORD is too long (maximum 72 bytes)');
  }

  if (problems.length > 0) {
    throw new Error(`Check your .env file:\n - ${problems.join('\n - ')}`);
  }
  return { name, email, password, phone };
}

async function main() {
  const { name, email, password, phone } = readSettings();
  await connectDB();

  const existing = await User.findOne({ email });
  if (existing) {
    if (existing.role === 'admin') {
      console.log(`Admin ${email} already exists. Nothing was changed.`);
      return;
    }
    // Never turn a patient or doctor into an admin by accident.
    throw new Error(
      `${email} is already used by a ${existing.role} account. Choose a different ADMIN_EMAIL.`
    );
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  try {
    // Using the Admin model sets the role to "admin" for us.
    await Admin.create({ name, email, phone, passwordHash });
    console.log(`Admin ${email} created.`);
  } catch (err) {
    // 11000 = duplicate key: another run created it a moment ago.
    if (err && err.code === 11000) {
      console.log(`Admin ${email} already exists. Nothing was changed.`);
      return;
    }
    throw err;
  }
}

main()
  .catch((err) => {
    console.error(`Seed failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());