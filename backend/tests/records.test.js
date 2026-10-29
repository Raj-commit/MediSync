// backend/tests/records.test.js
// Comprehensive test suite for FR-13: Medical Records (UC-09)
// Covers: MedicalRecord model, lazy creation with atomic upsert, age derivation,
// GET /records/me (patient read-only), GET /records/patient/:patientId (doctor access),
// POST /records/patient/:patientId/entries (doctor append), anti-enumeration (404),
// appointment status restrictions (confirmed/completed allowed; requested/cancelled 404),
// input validation, pagination, concurrency safety, Cache-Control: no-store, and PII protection.

process.env.JWT_SECRET = 'test-secret-for-records-tests';
process.env.JWT_EXPIRES_IN = '1d';

// Disable login rate limiter in tests
jest.mock('../src/middleware/rateLimiters', () => ({
  createLoginLimiter: () => (req, res, next) => next(),
}));

const request = require('supertest');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const app = require('../src/app');
const { User, Patient, Doctor, Admin } = require('../src/models/User');
const Slot = require('../src/models/Slot');
const Appointment = require('../src/models/Appointment');
const MedicalRecord = require('../src/models/MedicalRecord');
const recordService = require('../src/services/recordService');
const { connectTestDB, clearTestDB, closeTestDB } = require('./helpers/db');

jest.setTimeout(30000);

beforeAll(async () => {
  await connectTestDB();
  await User.init();
  await Slot.init();
  await Appointment.init();
  await MedicalRecord.init();
});

beforeEach(async () => {
  await clearTestDB();
  jest.restoreAllMocks();
});

afterAll(async () => {
  await closeTestDB();
});

// ---------- Helpers ----------

const PASSWORD = 'password123';
let userSeq = 0;

function patientData(overrides = {}) {
  userSeq += 1;
  return {
    role: 'patient',
    name: `Patient ${userSeq}`,
    email: `patient_${userSeq}_${Date.now()}@example.com`,
    phone: `+9112345${String(userSeq).padStart(5, '0')}`,
    password: PASSWORD,
    dateOfBirth: '1996-06-15',
    address: '123 Park Street, Kolkata',
    ...overrides,
  };
}

function doctorData(overrides = {}) {
  userSeq += 1;
  return {
    role: 'doctor',
    name: `Dr. Sen ${userSeq}`,
    email: `doctor_${userSeq}_${Date.now()}@example.com`,
    phone: `+9198765${String(userSeq).padStart(5, '0')}`,
    password: PASSWORD,
    specialisations: ['Cardiology'],
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
  userSeq += 1;
  const email = `admin_${userSeq}_${Date.now()}@example.com`;
  await Admin.create({
    name: 'Admin User',
    email,
    phone: `+9111111${String(userSeq).padStart(5, '0')}`,
    passwordHash: await bcrypt.hash(PASSWORD, 4),
  });
  const res = await loginUser(email, PASSWORD);
  expect(res.status).toBe(200);
  return { token: res.body.token, user: res.body.user };
}

async function createAppointmentDirect({ patientId, doctorId, status = 'confirmed' }) {
  const start = new Date(Date.now() + 24 * 3600 * 1000);
  const end = new Date(start.getTime() + 30 * 60 * 1000);

  const slot = await Slot.create({
    doctor: doctorId,
    startTime: start,
    endTime: end,
    isBooked: true,
  });

  return Appointment.create({
    patient: patientId,
    doctor: doctorId,
    slot: slot._id,
    dateTime: start,
    endTime: end,
    status,
  });
}

// ==============================================================================
// 1. Model & Age Utility Tests
// ==============================================================================
describe('MedicalRecord Model & Utilities', () => {
  it('enforces unique index on patient field so a patient cannot have duplicate records', async () => {
    const patient = await createPatientAndLogin();
    const patientId = new mongoose.Types.ObjectId(patient.user.id);

    await MedicalRecord.create({
      patient: patientId,
      entries: [],
    });

    await expect(
      MedicalRecord.create({
        patient: patientId,
        entries: [],
      })
    ).rejects.toThrow();
  });

  it('correctly calculates age from dateOfBirth and handles null gracefully', () => {
    const today = new Date();
    const birthYear = today.getFullYear() - 25;
    // Birthday earlier this year
    const dobPast = new Date(birthYear, 0, 1).toISOString().slice(0, 10);
    expect(recordService.calculateAge(dobPast)).toBe(25);

    expect(recordService.calculateAge(null)).toBeNull();
    expect(recordService.calculateAge(undefined)).toBeNull();
    expect(recordService.calculateAge('invalid-date')).toBeNull();
  });

  it('validates schema constraints on entries (diagnosis max 300, notes max 3000)', async () => {
    const patient = await createPatientAndLogin();
    const patientId = new mongoose.Types.ObjectId(patient.user.id);

    const doc = new MedicalRecord({
      patient: patientId,
      entries: [
        {
          diagnosis: 'A'.repeat(301),
          notes: 'Valid notes',
          updatedBy: patientId,
        },
      ],
    });

    let err;
    try {
      await doc.validate();
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(err.errors['entries.0.diagnosis']).toBeDefined();
  });
});

// ==============================================================================
// 2. GET /api/v1/records/me (Patient Read Own Record)
// ==============================================================================
describe('GET /api/v1/records/me', () => {
  it('returns 200 with virtual empty record when patient has no record document (read-only)', async () => {
    const patient = await createPatientAndLogin();

    const res = await request(app)
      .get('/api/v1/records/me')
      .set('Authorization', `Bearer ${patient.token}`);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.record).toBeDefined();
    expect(res.body.record.patient).toEqual({
      id: patient.user.id,
      name: patient.user.name,
      age: expect.any(Number),
    });
    expect(res.body.record.entries).toEqual([]);
    expect(res.body.record.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 0,
      totalPages: 0,
    });

    // Pure read-only check: no document must be written to MongoDB
    const docInDb = await MedicalRecord.findOne({ patient: patient.user.id });
    expect(docInDb).toBeNull();
  });

  it('never leaks dateOfBirth, address, phone, email, or passwordHash', async () => {
    const patient = await createPatientAndLogin();

    const res = await request(app)
      .get('/api/v1/records/me')
      .set('Authorization', `Bearer ${patient.token}`);

    expect(res.status).toBe(200);
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain(patient.rawData.email);
    expect(bodyStr).not.toContain(patient.rawData.phone);
    expect(bodyStr).not.toContain(patient.rawData.address);
    expect(bodyStr).not.toContain('dateOfBirth');
    expect(bodyStr).not.toContain('passwordHash');
  });

  it('returns entries sorted newest-first and supports pagination', async () => {
    const patient = await createPatientAndLogin();
    const doctor = await createDoctorAndLogin();

    // Seed medical record with multiple entries directly
    const patientId = new mongoose.Types.ObjectId(patient.user.id);
    const doctorId = new mongoose.Types.ObjectId(doctor.user.id);

    const date1 = new Date(Date.now() - 3600 * 1000 * 2);
    const date2 = new Date(Date.now() - 3600 * 1000);
    const date3 = new Date(Date.now());

    await MedicalRecord.create({
      patient: patientId,
      entries: [
        { diagnosis: 'Older Diagnosis', notes: 'First visit notes', updatedAt: date1, updatedBy: doctorId },
        { diagnosis: 'Middle Diagnosis', notes: 'Second visit notes', updatedAt: date2, updatedBy: doctorId },
        { diagnosis: 'Latest Diagnosis', notes: 'Third visit notes', updatedAt: date3, updatedBy: doctorId },
      ],
    });

    // Page 1, limit 2: should return latest 2 entries
    const res = await request(app)
      .get('/api/v1/records/me?page=1&limit=2')
      .set('Authorization', `Bearer ${patient.token}`);

    expect(res.status).toBe(200);
    expect(res.body.record.entries).toHaveLength(2);
    expect(res.body.record.entries[0].diagnosis).toBe('Latest Diagnosis');
    expect(res.body.record.entries[1].diagnosis).toBe('Middle Diagnosis');
    expect(res.body.record.pagination).toEqual({
      page: 1,
      limit: 2,
      total: 3,
      totalPages: 2,
    });

    // Page 2, limit 2: should return oldest entry
    const res2 = await request(app)
      .get('/api/v1/records/me?page=2&limit=2')
      .set('Authorization', `Bearer ${patient.token}`);

    expect(res2.status).toBe(200);
    expect(res2.body.record.entries).toHaveLength(1);
    expect(res2.body.record.entries[0].diagnosis).toBe('Older Diagnosis');
  });

  it('returns 401 UNAUTHORIZED when no token is provided', async () => {
    const res = await request(app).get('/api/v1/records/me');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 FORBIDDEN when called by a doctor or admin', async () => {
    const doctor = await createDoctorAndLogin();
    const admin = await createAdminAndLogin();

    const docRes = await request(app)
      .get('/api/v1/records/me')
      .set('Authorization', `Bearer ${doctor.token}`);
    expect(docRes.status).toBe(403);
    expect(docRes.body.code).toBe('FORBIDDEN');

    const adminRes = await request(app)
      .get('/api/v1/records/me')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(adminRes.status).toBe(403);
    expect(adminRes.body.code).toBe('FORBIDDEN');
  });

  it('rejects unexpected request body with 400 VALIDATION_ERROR', async () => {
    const patient = await createPatientAndLogin();

    const res = await request(app)
      .get('/api/v1/records/me')
      .set('Authorization', `Bearer ${patient.token}`)
      .send({ unexpected: 'field' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects unknown query parameters with 400 VALIDATION_ERROR', async () => {
    const patient = await createPatientAndLogin();

    const res = await request(app)
      .get('/api/v1/records/me?filter=active')
      .set('Authorization', `Bearer ${patient.token}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

// ==============================================================================
// 3. GET /api/v1/records/patient/:patientId (Doctor Read Patient Record)
// ==============================================================================
describe('GET /api/v1/records/patient/:patientId', () => {
  it('allows doctor with confirmed appointment to read patient record (200 OK)', async () => {
    const patient = await createPatientAndLogin();
    const doctor = await createDoctorAndLogin();

    await createAppointmentDirect({
      patientId: patient.user.id,
      doctorId: doctor.user.id,
      status: 'confirmed',
    });

    const res = await request(app)
      .get(`/api/v1/records/patient/${patient.user.id}`)
      .set('Authorization', `Bearer ${doctor.token}`);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.record.patient.id).toBe(patient.user.id);
    expect(res.body.record.patient.name).toBe(patient.user.name);
    expect(res.body.record.entries).toEqual([]);
  });

  it('preserves access for completed consultations for follow-up care (200 OK)', async () => {
    const patient = await createPatientAndLogin();
    const doctor = await createDoctorAndLogin();

    await createAppointmentDirect({
      patientId: patient.user.id,
      doctorId: doctor.user.id,
      status: 'completed',
    });

    const res = await request(app)
      .get(`/api/v1/records/patient/${patient.user.id}`)
      .set('Authorization', `Bearer ${doctor.token}`);

    expect(res.status).toBe(200);
    expect(res.body.record.patient.id).toBe(patient.user.id);
  });

  it('returns 404 NOT_FOUND when appointment is only requested or cancelled', async () => {
    const patient = await createPatientAndLogin();
    const doctor = await createDoctorAndLogin();

    // 1. Requested appointment
    await createAppointmentDirect({
      patientId: patient.user.id,
      doctorId: doctor.user.id,
      status: 'requested',
    });

    const res1 = await request(app)
      .get(`/api/v1/records/patient/${patient.user.id}`)
      .set('Authorization', `Bearer ${doctor.token}`);
    expect(res1.status).toBe(404);
    expect(res1.body.code).toBe('NOT_FOUND');
    expect(res1.body.message).toBe('Patient not found');

    // 2. Cancelled appointment
    await clearTestDB();
    const p2 = await createPatientAndLogin();
    const d2 = await createDoctorAndLogin();
    await createAppointmentDirect({
      patientId: p2.user.id,
      doctorId: d2.user.id,
      status: 'cancelled',
    });

    const res2 = await request(app)
      .get(`/api/v1/records/patient/${p2.user.id}`)
      .set('Authorization', `Bearer ${d2.token}`);
    expect(res2.status).toBe(404);
    expect(res2.body.code).toBe('NOT_FOUND');
    expect(res2.body.message).toBe('Patient not found');
  });

  it('anti-enumeration: returns identical 404 NOT_FOUND for no-appointment, non-patient, or non-existent ID', async () => {
    const doctor = await createDoctorAndLogin();
    const patientWithoutAppt = await createPatientAndLogin();
    const anotherDoctor = await createDoctorAndLogin();
    const nonExistentId = new mongoose.Types.ObjectId().toString();

    // Case 1: Real patient, but doctor has no qualifying appointment
    const res1 = await request(app)
      .get(`/api/v1/records/patient/${patientWithoutAppt.user.id}`)
      .set('Authorization', `Bearer ${doctor.token}`);
    expect(res1.status).toBe(404);
    expect(res1.body.message).toBe('Patient not found');

    // Case 2: Target ID belongs to a doctor, not a patient
    const res2 = await request(app)
      .get(`/api/v1/records/patient/${anotherDoctor.user.id}`)
      .set('Authorization', `Bearer ${doctor.token}`);
    expect(res2.status).toBe(404);
    expect(res2.body.message).toBe('Patient not found');

    // Case 3: Target ID does not exist in DB
    const res3 = await request(app)
      .get(`/api/v1/records/patient/${nonExistentId}`)
      .set('Authorization', `Bearer ${doctor.token}`);
    expect(res3.status).toBe(404);
    expect(res3.body.message).toBe('Patient not found');
  });

  it('rejects invalid hex patient ID with 400 VALIDATION_ERROR', async () => {
    const doctor = await createDoctorAndLogin();

    const res = await request(app)
      .get('/api/v1/records/patient/invalid-hex-id')
      .set('Authorization', `Bearer ${doctor.token}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.message).toBe('Invalid patient ID');
  });

  it('rejects non-doctor users (patients, admins) with 403 FORBIDDEN', async () => {
    const patient = await createPatientAndLogin();
    const admin = await createAdminAndLogin();
    const targetPatientId = new mongoose.Types.ObjectId().toString();

    const patRes = await request(app)
      .get(`/api/v1/records/patient/${targetPatientId}`)
      .set('Authorization', `Bearer ${patient.token}`);
    expect(patRes.status).toBe(403);
    expect(patRes.body.code).toBe('FORBIDDEN');

    const adminRes = await request(app)
      .get(`/api/v1/records/patient/${targetPatientId}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(adminRes.status).toBe(403);
    expect(adminRes.body.code).toBe('FORBIDDEN');
  });

  it('doctor info in entries only exposes { id, name } and never exposes doctor phone or email', async () => {
    const patient = await createPatientAndLogin();
    const doctor = await createDoctorAndLogin();

    await createAppointmentDirect({
      patientId: patient.user.id,
      doctorId: doctor.user.id,
      status: 'confirmed',
    });

    // Add entry
    await request(app)
      .post(`/api/v1/records/patient/${patient.user.id}/entries`)
      .set('Authorization', `Bearer ${doctor.token}`)
      .send({ diagnosis: 'Hypertension', notes: 'Routine checkup' });

    const res = await request(app)
      .get(`/api/v1/records/patient/${patient.user.id}`)
      .set('Authorization', `Bearer ${doctor.token}`);

    expect(res.status).toBe(200);
    const entry = res.body.record.entries[0];
    expect(entry.updatedBy).toEqual({
      id: doctor.user.id,
      name: doctor.user.name,
    });
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain(doctor.rawData.email);
    expect(bodyStr).not.toContain(doctor.rawData.phone);
  });
});

// ==============================================================================
// 4. POST /api/v1/records/patient/:patientId/entries (Doctor Append Entry)
// ==============================================================================
describe('POST /api/v1/records/patient/:patientId/entries', () => {
  it('creates record lazily on first entry and returns 201 Created with entry details', async () => {
    const patient = await createPatientAndLogin();
    const doctor = await createDoctorAndLogin();

    await createAppointmentDirect({
      patientId: patient.user.id,
      doctorId: doctor.user.id,
      status: 'confirmed',
    });

    // Verify no record exists yet
    expect(await MedicalRecord.findOne({ patient: patient.user.id })).toBeNull();

    const res = await request(app)
      .post(`/api/v1/records/patient/${patient.user.id}/entries`)
      .set('Authorization', `Bearer ${doctor.token}`)
      .send({
        diagnosis: 'Type 2 Diabetes',
        notes: 'Started on Metformin 500mg daily. Follow-up in 4 weeks.',
      });

    expect(res.status).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.entry).toBeDefined();
    expect(res.body.entry.diagnosis).toBe('Type 2 Diabetes');
    expect(res.body.entry.notes).toBe('Started on Metformin 500mg daily. Follow-up in 4 weeks.');
    expect(res.body.entry.updatedBy).toEqual({
      id: doctor.user.id,
      name: doctor.user.name,
    });
    expect(res.body.entry.updatedAt).toBeDefined();
    expect(res.body.entry.id).toBeDefined();

    // Verify document was created lazily in DB
    const recordInDb = await MedicalRecord.findOne({ patient: patient.user.id });
    expect(recordInDb).not.toBeNull();
    expect(recordInDb.entries).toHaveLength(1);
    expect(recordInDb.entries[0].diagnosis).toBe('Type 2 Diabetes');
  });

  it('appends subsequent entries to the same MedicalRecord document', async () => {
    const patient = await createPatientAndLogin();
    const doctor = await createDoctorAndLogin();

    await createAppointmentDirect({
      patientId: patient.user.id,
      doctorId: doctor.user.id,
      status: 'confirmed',
    });

    // First entry
    await request(app)
      .post(`/api/v1/records/patient/${patient.user.id}/entries`)
      .set('Authorization', `Bearer ${doctor.token}`)
      .send({ diagnosis: 'First Diagnosis', notes: 'First entry notes' });

    // Second entry
    const res2 = await request(app)
      .post(`/api/v1/records/patient/${patient.user.id}/entries`)
      .set('Authorization', `Bearer ${doctor.token}`)
      .send({ diagnosis: 'Second Diagnosis', notes: 'Second entry notes' });

    expect(res2.status).toBe(201);
    expect(res2.body.entry.diagnosis).toBe('Second Diagnosis');

    // Only one record document exists, with 2 entries
    const records = await MedicalRecord.find({ patient: patient.user.id });
    expect(records).toHaveLength(1);
    expect(records[0].entries).toHaveLength(2);
  });

  it('allows doctor with completed appointment to add entry', async () => {
    const patient = await createPatientAndLogin();
    const doctor = await createDoctorAndLogin();

    await createAppointmentDirect({
      patientId: patient.user.id,
      doctorId: doctor.user.id,
      status: 'completed',
    });

    const res = await request(app)
      .post(`/api/v1/records/patient/${patient.user.id}/entries`)
      .set('Authorization', `Bearer ${doctor.token}`)
      .send({ diagnosis: 'Post-consult update', notes: 'Patient reports improvement.' });

    expect(res.status).toBe(201);
  });

  it('rejects adding entry when appointment is requested or cancelled (404 NOT_FOUND)', async () => {
    const patient = await createPatientAndLogin();
    const doctor = await createDoctorAndLogin();

    await createAppointmentDirect({
      patientId: patient.user.id,
      doctorId: doctor.user.id,
      status: 'requested',
    });

    const res = await request(app)
      .post(`/api/v1/records/patient/${patient.user.id}/entries`)
      .set('Authorization', `Bearer ${doctor.token}`)
      .send({ diagnosis: 'Premature Entry', notes: 'Should be rejected' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(res.body.message).toBe('Patient not found');
  });

  it('rejects adding entry without appointment (404 NOT_FOUND)', async () => {
    const patient = await createPatientAndLogin();
    const doctor = await createDoctorAndLogin();

    const res = await request(app)
      .post(`/api/v1/records/patient/${patient.user.id}/entries`)
      .set('Authorization', `Bearer ${doctor.token}`)
      .send({ diagnosis: 'Diagnosis', notes: 'Notes' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('rejects non-doctor users with 403 FORBIDDEN', async () => {
    const patient = await createPatientAndLogin();
    const admin = await createAdminAndLogin();
    const targetId = new mongoose.Types.ObjectId().toString();

    const patRes = await request(app)
      .post(`/api/v1/records/patient/${targetId}/entries`)
      .set('Authorization', `Bearer ${patient.token}`)
      .send({ diagnosis: 'Test', notes: 'Notes' });
    expect(patRes.status).toBe(403);

    const adminRes = await request(app)
      .post(`/api/v1/records/patient/${targetId}/entries`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ diagnosis: 'Test', notes: 'Notes' });
    expect(adminRes.status).toBe(403);
  });

  describe('Validation on POST entries', () => {
    let patient;
    let doctor;

    beforeEach(async () => {
      patient = await createPatientAndLogin();
      doctor = await createDoctorAndLogin();
      await createAppointmentDirect({
        patientId: patient.user.id,
        doctorId: doctor.user.id,
        status: 'confirmed',
      });
    });

    it('rejects missing diagnosis (400 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .post(`/api/v1/records/patient/${patient.user.id}/entries`)
        .set('Authorization', `Bearer ${doctor.token}`)
        .send({ notes: 'Some notes' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('diagnosis is required');
    });

    it('rejects empty or whitespace diagnosis (400 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .post(`/api/v1/records/patient/${patient.user.id}/entries`)
        .set('Authorization', `Bearer ${doctor.token}`)
        .send({ diagnosis: '   ', notes: 'Some notes' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('diagnosis must be a non-empty string');
    });

    it('rejects diagnosis longer than 300 characters (400 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .post(`/api/v1/records/patient/${patient.user.id}/entries`)
        .set('Authorization', `Bearer ${doctor.token}`)
        .send({ diagnosis: 'A'.repeat(301), notes: 'Some notes' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('diagnosis must not exceed 300 characters');
    });

    it('rejects missing notes (400 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .post(`/api/v1/records/patient/${patient.user.id}/entries`)
        .set('Authorization', `Bearer ${doctor.token}`)
        .send({ diagnosis: 'Some diagnosis' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('notes is required');
    });

    it('rejects empty or whitespace notes (400 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .post(`/api/v1/records/patient/${patient.user.id}/entries`)
        .set('Authorization', `Bearer ${doctor.token}`)
        .send({ diagnosis: 'Some diagnosis', notes: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('notes must be a non-empty string');
    });

    it('rejects notes longer than 3000 characters (400 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .post(`/api/v1/records/patient/${patient.user.id}/entries`)
        .set('Authorization', `Bearer ${doctor.token}`)
        .send({ diagnosis: 'Some diagnosis', notes: 'B'.repeat(3001) });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('notes must not exceed 3,000 characters');
    });

    it('rejects injected client-supplied metadata fields (400 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .post(`/api/v1/records/patient/${patient.user.id}/entries`)
        .set('Authorization', `Bearer ${doctor.token}`)
        .send({
          diagnosis: 'Some diagnosis',
          notes: 'Some notes',
          updatedBy: new mongoose.Types.ObjectId().toString(),
          updatedAt: new Date().toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Unknown or forbidden field in request body');
    });
  });
});

// ==============================================================================
// 5. Concurrency Safety & Atomic Upsert Test
// ==============================================================================
describe('Concurrency Safety on Lazy Creation', () => {
  it('handles simultaneous first entry creation without duplicate key errors', async () => {
    const patient = await createPatientAndLogin();
    const doctor = await createDoctorAndLogin();

    await createAppointmentDirect({
      patientId: patient.user.id,
      doctorId: doctor.user.id,
      status: 'confirmed',
    });

    // Fire two concurrent POST requests to create the initial document
    const [res1, res2] = await Promise.all([
      request(app)
        .post(`/api/v1/records/patient/${patient.user.id}/entries`)
        .set('Authorization', `Bearer ${doctor.token}`)
        .send({ diagnosis: 'Concurrent Entry 1', notes: 'Notes 1' }),
      request(app)
        .post(`/api/v1/records/patient/${patient.user.id}/entries`)
        .set('Authorization', `Bearer ${doctor.token}`)
        .send({ diagnosis: 'Concurrent Entry 2', notes: 'Notes 2' }),
    ]);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);

    // Verify exactly one document exists in DB with both entries
    const records = await MedicalRecord.find({ patient: patient.user.id });
    expect(records).toHaveLength(1);
    expect(records[0].entries).toHaveLength(2);
  });
});
