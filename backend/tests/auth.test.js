// Set before any app code runs, because the token code reads them.
process.env.JWT_SECRET = 'test-secret-for-auth-tests';
process.env.JWT_EXPIRES_IN = '1d';

// The login rate limiter is tested on its own (rateLimit.test.js). Here it is
// switched off so the many logins in these tests are never blocked.
jest.mock('../src/middleware/rateLimiters', () => ({
  createLoginLimiter: () => (req, res, next) => next(),
}));

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { User, Admin } = require('../src/models/User');
const { authenticate } = require('../src/middleware/auth');
const { requireRole } = require('../src/middleware/requireRole');
const errorHandler = require('../src/middleware/errorHandler');
const { connectTestDB, clearTestDB, closeTestDB } = require('./helpers/db');

// Password hashing takes a moment, so allow more time than the 5 second default.
jest.setTimeout(20000);

beforeAll(async () => {
  await connectTestDB();
  // Wait until the unique email index exists, so duplicate checks are reliable.
  await User.init();
});

// Every test starts with an empty database.
beforeEach(async () => {
  await clearTestDB();
});

afterAll(async () => {
  await closeTestDB();
});

// ---------- helpers (all data here is made up) ----------

const PASSWORD = 'password123';

function patientBody(overrides = {}) {
  return {
    role: 'patient',
    name: 'Test Patient',
    email: 'patient@example.com',
    phone: '+911234567890',
    password: PASSWORD,
    dateOfBirth: '2000-01-31',
    address: '1 Test Street',
    ...overrides,
  };
}

function doctorBody(overrides = {}) {
  return {
    role: 'doctor',
    name: 'Test Doctor',
    email: 'doctor@example.com',
    phone: '+919876543210',
    password: PASSWORD,
    specialisations: ['Cardiology', 'Internal Medicine'],
    qualification: 'MBBS, MD',
    ...overrides,
  };
}

const register = (body) => request(app).post('/api/v1/auth/register').send(body);
const login = (email, password = PASSWORD) =>
  request(app).post('/api/v1/auth/login').send({ email, password });
const me = (token) => request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);

// Registers a user through the API, logs in, and returns { token, user }.
async function createUserAndLogin(body) {
  const registered = await register(body);
  expect(registered.status).toBe(201);
  const res = await login(body.email, body.password);
  expect(res.status).toBe(200);
  return res.body;
}

// Admins cannot register through the API, so create one directly, then log in.
async function createAdminAndLogin() {
  const email = 'admin@example.com';
  await Admin.create({
    name: 'Test Admin',
    email,
    phone: '+911111111111',
    passwordHash: await bcrypt.hash(PASSWORD, 4),
  });
  const res = await login(email);
  expect(res.status).toBe(200);
  return res.body;
}

// ---------- register ----------

describe('POST /api/v1/auth/register', () => {
  it('registers a patient', async () => {
    const res = await register(patientBody());

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      user: { id: expect.any(String), name: 'Test Patient', email: 'patient@example.com', role: 'patient' },
    });

    const stored = await User.findOne({ email: 'patient@example.com' }).select('+passwordHash');
    expect(stored.role).toBe('patient');
    expect(stored.isActive).toBe(true);
    expect(stored.address).toBe('1 Test Street');
    expect(stored.dateOfBirth.toISOString().slice(0, 10)).toBe('2000-01-31');
    // The password is stored only as a hash, never as plain text.
    expect(stored.passwordHash).not.toBe(PASSWORD);
    expect(await bcrypt.compare(PASSWORD, stored.passwordHash)).toBe(true);
  });

  it('registers a doctor who is active immediately', async () => {
    const res = await register(doctorBody());

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('doctor');

    const stored = await User.findOne({ email: 'doctor@example.com' });
    expect(stored.isActive).toBe(true);
    expect(Array.from(stored.specialisations)).toEqual(['Cardiology', 'Internal Medicine']);
    expect(stored.qualification).toBe('MBBS, MD');
  });

  it('trims and lowercases the email, and rejects a duplicate with 409', async () => {
    const first = await register(patientBody({ email: '  PATIENT@Example.COM  ' }));
    expect(first.status).toBe(201);
    expect(first.body.user.email).toBe('patient@example.com');

    const second = await register(patientBody({ email: 'patient@example.com' }));
    expect(second.status).toBe(409);
    expect(second.body).toEqual({ message: 'Email already registered', code: 'EMAIL_TAKEN' });
  });

  it('never creates an admin', async () => {
    const res = await register(patientBody({ role: 'admin' }));

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(await User.countDocuments()).toBe(0);
  });

  it('ignores an isActive or role value smuggled into the body', async () => {
    const res = await register({ ...patientBody(), isActive: false, passwordHash: 'x' });

    expect(res.status).toBe(201);
    const stored = await User.findOne({ email: 'patient@example.com' }).select('+passwordHash');
    expect(stored.isActive).toBe(true);
    expect(stored.passwordHash).not.toBe('x');
  });

  it.each([
    ['a password shorter than 8 characters', patientBody({ password: '1234567' }), 'Password must be at least 8 characters'],
    ['a missing name', patientBody({ name: '' }), 'Name is required'],
    ['an invalid email', patientBody({ email: 'not-an-email' }), 'Enter a valid email address'],
    ['an email sent as an object', patientBody({ email: { $gt: '' } }), 'Email is required'],
    ['a patient without a date of birth', patientBody({ dateOfBirth: undefined }), 'Date of birth must be a date in the format YYYY-MM-DD'],
    ['a doctor without specialisations', doctorBody({ specialisations: [] }), 'Enter between 1 and 10 specialisations'],
    ['a doctor without a qualification', doctorBody({ qualification: '' }), 'Qualification is required'],
    ['an unknown role', patientBody({ role: 'nurse' }), 'Role must be patient or doctor'],
  ])('rejects %s with 400 VALIDATION_ERROR', async (label, body, message) => {
    const res = await register(body);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message, code: 'VALIDATION_ERROR' });
    expect(await User.countDocuments()).toBe(0);
  });

  it('handles two requests with the same email at the same moment', async () => {
    const results = await Promise.all([register(patientBody()), register(patientBody())]);
    const statuses = results.map((res) => res.status).sort();

    // One wins, the other gets EMAIL_TAKEN (not a 500).
    expect(statuses).toEqual([201, 409]);
    expect(await User.countDocuments({ email: 'patient@example.com' })).toBe(1);
  });

  it('returns 400 INVALID_JSON for a broken JSON body', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .set('Content-Type', 'application/json')
      .send('{ this is not json');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_JSON');
  });
});

// ---------- login ----------

describe('POST /api/v1/auth/login', () => {
  it('returns a token and the public user, and the token lasts 1 day', async () => {
    await register(patientBody());
    const stored = await User.findOne({ email: 'patient@example.com' });

    const res = await login('patient@example.com');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      token: expect.any(String),
      user: { id: stored.id, name: 'Test Patient', email: 'patient@example.com', role: 'patient' },
    });
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');

    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
    expect(decoded.sub).toBe(stored.id);
    expect(decoded.role).toBe('patient');
    expect(decoded.exp - decoded.iat).toBe(24 * 60 * 60);
  });

  it('accepts the email in any letter case', async () => {
    await register(patientBody());
    const res = await login('PATIENT@EXAMPLE.COM');
    expect(res.status).toBe(200);
  });

  it('gives the same generic 401 for a wrong password', async () => {
    await register(patientBody());
    const res = await login('patient@example.com', 'wrong-password');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Invalid email or password', code: 'INVALID_CREDENTIALS' });
  });

  it('gives exactly the same 401 for an unknown email', async () => {
    await register(patientBody());
    const wrongPassword = await login('patient@example.com', 'wrong-password');
    const unknownEmail = await login('nobody@example.com');

    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body).toEqual(wrongPassword.body);
  });

  it('gives 403 ACCOUNT_DISABLED for an inactive account, but only with the right password', async () => {
    await register(patientBody());
    await User.updateOne({ email: 'patient@example.com' }, { isActive: false });

    const rightPassword = await login('patient@example.com');
    expect(rightPassword.status).toBe(403);
    expect(rightPassword.body.code).toBe('ACCOUNT_DISABLED');

    // A wrong password must not reveal that the account exists or is disabled.
    const wrongPassword = await login('patient@example.com', 'wrong-password');
    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns 400 VALIDATION_ERROR when email or password is missing', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'patient@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 VALIDATION_ERROR when the email is an object instead of text', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: { $gt: '' }, password: PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

// ---------- me ----------

describe('GET /api/v1/auth/me (logged in)', () => {
  it('returns the logged-in user without any private fields', async () => {
    const { token, user } = await createUserAndLogin(patientBody());

    const res = await me(token);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user });
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('returns 403 ACCOUNT_DISABLED when the account is disabled after login', async () => {
    const { token } = await createUserAndLogin(patientBody());
    await User.updateOne({ email: 'patient@example.com' }, { isActive: false });

    const res = await me(token);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_DISABLED');
  });

  it('returns 401 INVALID_TOKEN when the user no longer exists', async () => {
    const { token, user } = await createUserAndLogin(patientBody());
    await User.deleteOne({ _id: user.id });

    const res = await me(token);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });

  it('uses the role from the database, not the role written in the token', async () => {
    const { user } = await createUserAndLogin(patientBody());
    // A correctly signed token that falsely claims to be an admin.
    const forged = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, {
      subject: user.id,
      expiresIn: '1h',
    });

    const res = await me(forged);

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('patient');
  });
});

// ---------- role rejection with real users and real tokens ----------

describe('role checks (authenticate + requireRole)', () => {
  // A small app with two protected routes, just for these tests.
  const roleApp = express();
  roleApp.get('/doctor-only', authenticate, requireRole('doctor'), (req, res) => res.json({ ok: true }));
  roleApp.get('/admin-only', authenticate, requireRole('admin'), (req, res) => res.json({ ok: true }));
  roleApp.use(errorHandler);

  const get = (path, token) => {
    const req = request(roleApp).get(path);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  it('rejects a patient on a doctor route with 403 FORBIDDEN', async () => {
    const { token } = await createUserAndLogin(patientBody());

    const res = await get('/doctor-only', token);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('lets a doctor into the doctor route', async () => {
    const { token } = await createUserAndLogin(doctorBody());

    const res = await get('/doctor-only', token);

    expect(res.status).toBe(200);
  });

  it('rejects a doctor on an admin route with 403 FORBIDDEN', async () => {
    const { token } = await createUserAndLogin(doctorBody());

    const res = await get('/admin-only', token);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('lets an admin into the admin route', async () => {
    const { token } = await createAdminAndLogin();

    const res = await get('/admin-only', token);

    expect(res.status).toBe(200);
  });

  it('rejects a request with no token with 401', async () => {
    const res = await get('/doctor-only');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('rejects a patient whose token falsely claims the admin role', async () => {
    const { user } = await createUserAndLogin(patientBody());
    const forged = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, {
      subject: user.id,
      expiresIn: '1h',
    });

    const res = await get('/admin-only', forged);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });
});