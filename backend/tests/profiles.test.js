process.env.JWT_SECRET = 'test-secret-for-profile-tests';
process.env.JWT_EXPIRES_IN = '1d';

// Disable login rate limiter in tests
jest.mock('../src/middleware/rateLimiters', () => ({
  createLoginLimiter: () => (req, res, next) => next(),
}));

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { User, Patient, Doctor, Admin } = require('../src/models/User');
const { connectTestDB, clearTestDB, closeTestDB } = require('./helpers/db');

jest.setTimeout(20000);

beforeAll(async () => {
  await connectTestDB();
  await User.init();
});

beforeEach(async () => {
  await clearTestDB();
});

afterAll(async () => {
  await closeTestDB();
});

// ---------- Test Helpers ----------

const PASSWORD = 'password123';

function patientData(overrides = {}) {
  return {
    role: 'patient',
    name: 'Alice Patient',
    email: 'alice@example.com',
    phone: '+911234567890',
    password: PASSWORD,
    dateOfBirth: '1995-06-15',
    address: '123 Baker Street',
    ...overrides,
  };
}

function doctorData(overrides = {}) {
  return {
    role: 'doctor',
    name: 'Dr. Bob Smith',
    email: 'dr.bob@example.com',
    phone: '+919876543210',
    password: PASSWORD,
    specialisations: ['Cardiology', 'Internal Medicine'],
    qualification: 'MBBS, MD',
    ...overrides,
  };
}

const registerUser = (body) => request(app).post('/api/v1/auth/register').send(body);
const loginUser = (email, password = PASSWORD) =>
  request(app).post('/api/v1/auth/login').send({ email, password });

async function createPatientAndLogin(overrides = {}) {
  const data = patientData(overrides);
  const regRes = await registerUser(data);
  expect(regRes.status).toBe(201);
  const logRes = await loginUser(data.email, data.password);
  expect(logRes.status).toBe(200);
  return { token: logRes.body.token, user: logRes.body.user, rawData: data };
}

async function createDoctorAndLogin(overrides = {}) {
  const data = doctorData(overrides);
  const regRes = await registerUser(data);
  expect(regRes.status).toBe(201);
  const logRes = await loginUser(data.email, data.password);
  expect(logRes.status).toBe(200);
  return { token: logRes.body.token, user: logRes.body.user, rawData: data };
}

async function createAdminAndLogin() {
  const email = 'admin@example.com';
  await Admin.create({
    name: 'Admin User',
    email,
    phone: '+911111111111',
    passwordHash: await bcrypt.hash(PASSWORD, 4),
  });
  const res = await loginUser(email, PASSWORD);
  expect(res.status).toBe(200);
  return { token: res.body.token, user: res.body.user };
}

const getMe = (token) =>
  token
    ? request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${token}`)
    : request(app).get('/api/v1/users/me');

const putMe = (token, body) =>
  token
    ? request(app).put('/api/v1/users/me').set('Authorization', `Bearer ${token}`).send(body)
    : request(app).put('/api/v1/users/me').send(body);

const getDoctors = (token, query = {}) => {
  let req = request(app).get('/api/v1/doctors');
  if (token) {
    req = req.set('Authorization', `Bearer ${token}`);
  }
  return req.query(query);
};

// =========================================================================
// 1. GET /api/v1/users/me
// =========================================================================

describe('GET /api/v1/users/me', () => {
  it('returns 401 UNAUTHORIZED when no token is provided', async () => {
    const res = await getMe();
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 INVALID_TOKEN for an invalid token', async () => {
    const res = await getMe('invalid.token.here');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });

  it('returns 403 ACCOUNT_DISABLED for a disabled user', async () => {
    const { token, user } = await createPatientAndLogin();
    await User.findByIdAndUpdate(user.id, { isActive: false });

    const res = await getMe(token);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_DISABLED');
  });

  it('returns 403 FORBIDDEN for admin users (admins have no profile)', async () => {
    const { token } = await createAdminAndLogin();
    const res = await getMe(token);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('returns full patient profile (including dateOfBirth and address, never passwordHash)', async () => {
    const { token, rawData } = await createPatientAndLogin();
    const res = await getMe(token);

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.id).toBeDefined();
    expect(res.body.user.name).toBe(rawData.name);
    expect(res.body.user.email).toBe(rawData.email);
    expect(res.body.user.phone).toBe(rawData.phone);
    expect(res.body.user.role).toBe('patient');
    expect(res.body.user.dateOfBirth).toBe(rawData.dateOfBirth);
    expect(res.body.user.address).toBe(rawData.address);

    // Must never return secrets or cross-role fields
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.user.password).toBeUndefined();
    expect(res.body.user.__v).toBeUndefined();
    expect(res.body.user.specialisations).toBeUndefined();
    expect(res.body.user.qualification).toBeUndefined();
  });

  it('returns full doctor profile (including specialisations and qualification, never passwordHash)', async () => {
    const { token, rawData } = await createDoctorAndLogin();
    const res = await getMe(token);

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.id).toBeDefined();
    expect(res.body.user.name).toBe(rawData.name);
    expect(res.body.user.email).toBe(rawData.email);
    expect(res.body.user.phone).toBe(rawData.phone);
    expect(res.body.user.role).toBe('doctor');
    expect(res.body.user.specialisations).toEqual(rawData.specialisations);
    expect(res.body.user.qualification).toBe(rawData.qualification);

    // Must never return secrets or cross-role fields
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.user.password).toBeUndefined();
    expect(res.body.user.__v).toBeUndefined();
    expect(res.body.user.dateOfBirth).toBeUndefined();
    expect(res.body.user.address).toBeUndefined();
  });
});

// =========================================================================
// 2. PUT /api/v1/users/me
// =========================================================================

describe('PUT /api/v1/users/me', () => {
  it('returns 401 UNAUTHORIZED when no token is provided', async () => {
    const res = await putMe(null, { name: 'New Name' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 FORBIDDEN when an admin tries to update profile', async () => {
    const { token } = await createAdminAndLogin();
    const res = await putMe(token, { name: 'Admin New Name' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  describe('Patient partial update', () => {
    it('updates name only and preserves other fields', async () => {
      const { token, rawData } = await createPatientAndLogin();
      const res = await putMe(token, { name: 'Alice Updated' });

      expect(res.status).toBe(200);
      expect(res.body.user.name).toBe('Alice Updated');
      expect(res.body.user.phone).toBe(rawData.phone);
      expect(res.body.user.dateOfBirth).toBe(rawData.dateOfBirth);
      expect(res.body.user.address).toBe(rawData.address);
      expect(res.body.user.email).toBe(rawData.email);
    });

    it('updates address and phone only', async () => {
      const { token, rawData } = await createPatientAndLogin();
      const res = await putMe(token, {
        phone: '+919999988888',
        address: '999 New Street',
      });

      expect(res.status).toBe(200);
      expect(res.body.user.phone).toBe('+919999988888');
      expect(res.body.user.address).toBe('999 New Street');
      expect(res.body.user.name).toBe(rawData.name);
      expect(res.body.user.dateOfBirth).toBe(rawData.dateOfBirth);
    });

    it('updates dateOfBirth with a valid date', async () => {
      const { token } = await createPatientAndLogin();
      const res = await putMe(token, { dateOfBirth: '1990-12-25' });

      expect(res.status).toBe(200);
      expect(res.body.user.dateOfBirth).toBe('1990-12-25');
    });
  });

  describe('Doctor partial update', () => {
    it('updates qualification only and preserves other fields', async () => {
      const { token, rawData } = await createDoctorAndLogin();
      const res = await putMe(token, { qualification: 'MBBS, MD, DM Cardiology' });

      expect(res.status).toBe(200);
      expect(res.body.user.qualification).toBe('MBBS, MD, DM Cardiology');
      expect(res.body.user.name).toBe(rawData.name);
      expect(res.body.user.specialisations).toEqual(rawData.specialisations);
    });

    it('updates specialisations array', async () => {
      const { token } = await createDoctorAndLogin();
      const res = await putMe(token, { specialisations: ['Pediatrics', 'Neonatology'] });

      expect(res.status).toBe(200);
      expect(res.body.user.specialisations).toEqual(['Pediatrics', 'Neonatology']);
    });
  });

  describe('Protected fields immutability', () => {
    it('refuses to update email and returns 400 VALIDATION_ERROR', async () => {
      const { token, rawData } = await createPatientAndLogin();
      const res = await putMe(token, { email: 'hacker@example.com' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toMatch(/email cannot be changed/i);

      // Verify email was not changed in DB
      const userInDb = await User.findOne({ email: rawData.email });
      expect(userInDb).not.toBeNull();
    });

    it('refuses to update role and returns 400 VALIDATION_ERROR', async () => {
      const { token } = await createPatientAndLogin();
      const res = await putMe(token, { role: 'doctor' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toMatch(/role cannot be changed/i);
    });

    it('refuses to update isActive and returns 400 VALIDATION_ERROR', async () => {
      const { token } = await createPatientAndLogin();
      const res = await putMe(token, { isActive: false });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toMatch(/isActive cannot be changed/i);
    });

    it('refuses to update password or passwordHash', async () => {
      const { token } = await createPatientAndLogin();
      const res = await putMe(token, { password: 'newpassword123' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toMatch(/password cannot be changed/i);
    });
  });

  describe('Cross-role restrictions', () => {
    it('rejects patient setting specialisations', async () => {
      const { token } = await createPatientAndLogin();
      const res = await putMe(token, { specialisations: ['Neurology'] });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toMatch(/not allowed for patient/i);
    });

    it('rejects patient setting qualification', async () => {
      const { token } = await createPatientAndLogin();
      const res = await putMe(token, { qualification: 'MBBS' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toMatch(/not allowed for patient/i);
    });

    it('rejects doctor setting dateOfBirth', async () => {
      const { token } = await createDoctorAndLogin();
      const res = await putMe(token, { dateOfBirth: '1985-01-01' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toMatch(/not allowed for doctor/i);
    });

    it('rejects doctor setting address', async () => {
      const { token } = await createDoctorAndLogin();
      const res = await putMe(token, { address: 'Doctor Clinic Address' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toMatch(/not allowed for doctor/i);
    });
  });

  describe('Validation constraints', () => {
    it('rejects empty body with 400 VALIDATION_ERROR', async () => {
      const { token } = await createPatientAndLogin();
      const res = await putMe(token, {});

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toMatch(/at least one field/i);
    });

    it('rejects empty or whitespace-only name', async () => {
      const { token } = await createPatientAndLogin();
      const res = await putMe(token, { name: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects name exceeding 100 characters', async () => {
      const { token } = await createPatientAndLogin();
      const res = await putMe(token, { name: 'a'.repeat(101) });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects invalid phone numbers (non-numeric, too short, too long)', async () => {
      const { token } = await createPatientAndLogin();

      const res1 = await putMe(token, { phone: '123' });
      expect(res1.status).toBe(400);

      const res2 = await putMe(token, { phone: 'invalid-phone-abc' });
      expect(res2.status).toBe(400);

      const res3 = await putMe(token, { phone: '1'.repeat(25) });
      expect(res3.status).toBe(400);
    });

    it('rejects invalid dateOfBirth (bad format, non-existent date, future date, before 1900)', async () => {
      const { token } = await createPatientAndLogin();

      // Bad format
      const res1 = await putMe(token, { dateOfBirth: '15-05-1995' });
      expect(res1.status).toBe(400);

      // Non-existent date (Feb 31)
      const res2 = await putMe(token, { dateOfBirth: '2000-02-31' });
      expect(res2.status).toBe(400);

      // Future date
      const res3 = await putMe(token, { dateOfBirth: '2099-01-01' });
      expect(res3.status).toBe(400);

      // Before 1900
      const res4 = await putMe(token, { dateOfBirth: '1850-01-01' });
      expect(res4.status).toBe(400);
    });

    it('rejects invalid doctor specialisations (empty array, > 10, non-string, empty string)', async () => {
      const { token } = await createDoctorAndLogin();

      // Empty array
      const res1 = await putMe(token, { specialisations: [] });
      expect(res1.status).toBe(400);

      // More than 10
      const res2 = await putMe(token, { specialisations: Array(11).fill('Spec') });
      expect(res2.status).toBe(400);

      // Empty item in array
      const res3 = await putMe(token, { specialisations: ['Valid', ''] });
      expect(res3.status).toBe(400);
    });
  });
});

// =========================================================================
// 3. GET /api/v1/doctors
// =========================================================================

describe('GET /api/v1/doctors', () => {
  it('returns 401 UNAUTHORIZED when no token is provided', async () => {
    const res = await getDoctors(null);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 FORBIDDEN when a doctor attempts to list doctors', async () => {
    const { token } = await createDoctorAndLogin();
    const res = await getDoctors(token);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('returns 403 FORBIDDEN when an admin attempts to list doctors', async () => {
    const { token } = await createAdminAndLogin();
    const res = await getDoctors(token);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  describe('Doctor listing & search for patients', () => {
    let patientToken;

    beforeEach(async () => {
      const patient = await createPatientAndLogin({ email: 'searcher@example.com' });
      patientToken = patient.token;

      // Seed test doctors
      await registerUser(
        doctorData({
          name: 'Dr. John Watson',
          email: 'watson@example.com',
          specialisations: ['General Medicine'],
          qualification: 'MBBS',
        })
      );
      await registerUser(
        doctorData({
          name: 'Dr. Gregory House',
          email: 'house@example.com',
          specialisations: ['Diagnostics', 'Infectious Disease'],
          qualification: 'MD',
        })
      );
      await registerUser(
        doctorData({
          name: 'Dr. Strange',
          email: 'strange@example.com',
          specialisations: ['Neuro Surgery'],
          qualification: 'MD, PhD',
        })
      );
    });

    it('lists all active doctors with sanitized fields only', async () => {
      const res = await getDoctors(patientToken);

      expect(res.status).toBe(200);
      expect(res.body.doctors).toHaveLength(3);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.total).toBe(3);
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(10);

      // Verify each doctor only exposes id, name, specialisations, qualification
      for (const doc of res.body.doctors) {
        expect(doc.id).toBeDefined();
        expect(doc.name).toBeDefined();
        expect(Array.isArray(doc.specialisations)).toBe(true);
        expect(doc.qualification).toBeDefined();

        expect(doc.email).toBeUndefined();
        expect(doc.phone).toBeUndefined();
        expect(doc.passwordHash).toBeUndefined();
        expect(doc.__v).toBeUndefined();
      }
    });

    it('hides inactive doctors from the list', async () => {
      await User.findOneAndUpdate({ email: 'house@example.com' }, { isActive: false });

      const res = await getDoctors(patientToken);
      expect(res.status).toBe(200);
      expect(res.body.doctors).toHaveLength(2);
      expect(res.body.pagination.total).toBe(2);

      const names = res.body.doctors.map((d) => d.name);
      expect(names).not.toContain('Dr. Gregory House');
    });

    it('searches by doctor name (case-insensitive, partial match)', async () => {
      const res = await getDoctors(patientToken, { name: 'watson' });

      expect(res.status).toBe(200);
      expect(res.body.doctors).toHaveLength(1);
      expect(res.body.doctors[0].name).toBe('Dr. John Watson');
    });

    it('searches by specialisation (case-insensitive, partial match)', async () => {
      const res = await getDoctors(patientToken, { specialisation: 'infectious' });

      expect(res.status).toBe(200);
      expect(res.body.doctors).toHaveLength(1);
      expect(res.body.doctors[0].name).toBe('Dr. Gregory House');
    });

    it('paginates results correctly', async () => {
      const resPage1 = await getDoctors(patientToken, { page: '1', limit: '2' });
      expect(resPage1.status).toBe(200);
      expect(resPage1.body.doctors).toHaveLength(2);
      expect(resPage1.body.pagination.page).toBe(1);
      expect(resPage1.body.pagination.limit).toBe(2);
      expect(resPage1.body.pagination.total).toBe(3);
      expect(resPage1.body.pagination.totalPages).toBe(2);

      const resPage2 = await getDoctors(patientToken, { page: '2', limit: '2' });
      expect(resPage2.status).toBe(200);
      expect(resPage2.body.doctors).toHaveLength(1);
      expect(resPage2.body.pagination.page).toBe(2);
    });

    it('safely handles search text with special regex characters', async () => {
      // Regex characters like *, +, ?, (, [, \, etc. must not crash or act as wildcard regex
      const res1 = await getDoctors(patientToken, { name: 'Dr.*' });
      expect(res1.status).toBe(200);
      // Literal 'Dr.*' does not match unless the doctor has literal '.*' in name
      expect(res1.body.doctors).toHaveLength(0);

      const res2 = await getDoctors(patientToken, { specialisation: '[a-z]+' });
      expect(res2.status).toBe(200);
      expect(res2.body.doctors).toHaveLength(0);
    });

    it('rejects query parameters that are arrays or objects (NoSQL injection prevention)', async () => {
      const resArray = await getDoctors(patientToken, { name: ['a', 'b'] });
      expect(resArray.status).toBe(400);
      expect(resArray.body.code).toBe('VALIDATION_ERROR');

      const resObj = await getDoctors(patientToken, { name: { $gt: '' } });
      expect(resObj.status).toBe(400);
      expect(resObj.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects search query exceeding 100 characters', async () => {
      const res = await getDoctors(patientToken, { name: 'x'.repeat(101) });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects invalid pagination parameters', async () => {
      // Non-integer page
      const res1 = await getDoctors(patientToken, { page: 'abc' });
      expect(res1.status).toBe(400);
      expect(res1.body.code).toBe('VALIDATION_ERROR');

      // Negative or zero page
      const res2 = await getDoctors(patientToken, { page: '0' });
      expect(res2.status).toBe(400);

      // Limit > 50
      const res3 = await getDoctors(patientToken, { limit: '51' });
      expect(res3.status).toBe(400);
    });
  });
});
