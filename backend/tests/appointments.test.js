process.env.JWT_SECRET = 'test-secret-for-appointments-tests';
process.env.JWT_EXPIRES_IN = '1d';

// Disable login rate limiter in tests
jest.mock('../src/middleware/rateLimiters', () => ({
  createLoginLimiter: () => (req, res, next) => next(),
}));

const request = require('supertest');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const app = require('../src/app');
const { User, Doctor, Admin } = require('../src/models/User');
const Slot = require('../src/models/Slot');
const Appointment = require('../src/models/Appointment');
const { connectTestDB, clearTestDB, closeTestDB } = require('./helpers/db');

jest.setTimeout(20000);

beforeAll(async () => {
  await connectTestDB();
  await User.init();
  await Slot.init();
  await Appointment.init();
});

beforeEach(async () => {
  await clearTestDB();
});

afterAll(async () => {
  await closeTestDB();
});

// ---------- Test Helpers ----------

const PASSWORD = 'password123';
let userSeq = 0;

function patientData(overrides = {}) {
  userSeq += 1;
  return {
    role: 'patient',
    name: 'Test Patient',
    email: `patient_${userSeq}_${Date.now()}@example.com`,
    phone: `+9112345${String(userSeq).padStart(5, '0')}`,
    password: PASSWORD,
    dateOfBirth: '1995-05-15',
    address: '123 Baker Street',
    ...overrides,
  };
}

function doctorData(overrides = {}) {
  userSeq += 1;
  return {
    role: 'doctor',
    name: 'Dr. Test Doctor',
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
  return { token: logRes.body.token, user: logRes.body.user };
}

async function createDoctorAndLogin(overrides = {}) {
  const data = doctorData(overrides);
  const regRes = await registerUser(data);
  expect(regRes.status).toBe(201);
  const logRes = await loginUser(data.email, data.password);
  expect(logRes.status).toBe(200);
  return { token: logRes.body.token, user: logRes.body.user };
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

function makeFutureSlotDates(hoursAhead = 24) {
  const start = new Date(Date.now() + hoursAhead * 3600 * 1000);
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  return {
    startTime: start,
    endTime: end,
    startTimeIso: start.toISOString(),
    endTimeIso: end.toISOString(),
  };
}

async function createDoctorWithSlot(hoursAhead = 24, isBooked = false, overrides = {}) {
  const docInfo = await createDoctorAndLogin(overrides);
  const times = makeFutureSlotDates(hoursAhead);
  const slot = await Slot.create({
    doctor: docInfo.user.id,
    startTime: times.startTime,
    endTime: times.endTime,
    isBooked,
  });
  return { ...docInfo, slot, times };
}

// ---------- Test Suites ----------

describe('POST /api/v1/appointments', () => {
  describe('Success path', () => {
    it('successfully books an open future slot, returns 201, marks slot booked, and removes it from public availability', async () => {
      const { user: doc, slot, times } = await createDoctorWithSlot(24);
      const { token: patientToken, user: pat } = await createPatientAndLogin();

      const res = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ doctorId: doc.id, slotId: slot._id.toString() });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('appointment');
      const { appointment } = res.body;

      expect(appointment.id).toBeDefined();
      expect(appointment.doctor).toEqual({
        id: doc.id,
        name: doc.name,
      });
      expect(appointment.dateTime).toBe(times.startTimeIso);
      expect(appointment.endTime).toBe(times.endTimeIso);
      expect(appointment.status).toBe('requested');

      // Verify zero leak of sensitive data (email, phone, passwordHash)
      expect(appointment.doctor.email).toBeUndefined();
      expect(appointment.doctor.phone).toBeUndefined();
      expect(res.body.email).toBeUndefined();
      expect(res.body.phone).toBeUndefined();
      expect(res.body.passwordHash).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain(PASSWORD);

      // Verify exactly one appointment exists in database
      const count = await Appointment.countDocuments();
      expect(count).toBe(1);

      const dbAppt = await Appointment.findById(appointment.id);
      expect(dbAppt).not.toBeNull();
      expect(dbAppt.patient.toString()).toBe(pat.id);
      expect(dbAppt.doctor.toString()).toBe(doc.id);
      expect(dbAppt.slot.toString()).toBe(slot._id.toString());
      expect(dbAppt.status).toBe('requested');

      // Verify slot is updated to isBooked: true
      const updatedSlot = await Slot.findById(slot._id);
      expect(updatedSlot.isBooked).toBe(true);

      // Verify slot is no longer returned in GET /api/v1/doctors/:id/availability
      const availRes = await request(app)
        .get(`/api/v1/doctors/${doc.id}/availability`)
        .set('Authorization', `Bearer ${patientToken}`);

      expect(availRes.status).toBe(200);
      expect(availRes.body.slots.find((s) => s.id === slot._id.toString())).toBeUndefined();
    });

    it('uses the verified JWT patient ID even if a patientId is passed in query or other places', async () => {
      const { user: doc, slot } = await createDoctorWithSlot(24);
      const { token: patientToken, user: pat } = await createPatientAndLogin();

      const res = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ doctorId: doc.id, slotId: slot._id.toString() });

      expect(res.status).toBe(201);
      const dbAppt = await Appointment.findById(res.body.appointment.id);
      expect(dbAppt.patient.toString()).toBe(pat.id);
    });
  });

  describe('Authentication and Role authorization', () => {
    it('returns 401 UNAUTHORIZED when no token is provided', async () => {
      const res = await request(app)
        .post('/api/v1/appointments')
        .send({ doctorId: new mongoose.Types.ObjectId().toString(), slotId: new mongoose.Types.ObjectId().toString() });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 INVALID_TOKEN when a malformed token is provided', async () => {
      const res = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', 'Bearer invalid.token.value')
        .send({ doctorId: new mongoose.Types.ObjectId().toString(), slotId: new mongoose.Types.ObjectId().toString() });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_TOKEN');
    });

    it('returns 403 FORBIDDEN when a doctor tries to book an appointment', async () => {
      const { token: docToken, user: doc, slot } = await createDoctorWithSlot(24);

      const res = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${docToken}`)
        .send({ doctorId: doc.id, slotId: slot._id.toString() });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('returns 403 FORBIDDEN when an admin tries to book an appointment', async () => {
      const { user: doc, slot } = await createDoctorWithSlot(24);
      const { token: adminToken } = await createAdminAndLogin();

      const res = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ doctorId: doc.id, slotId: slot._id.toString() });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });
  });

  describe('Input validation errors (400 VALIDATION_ERROR)', () => {
    let patientToken;
    let docId;
    let slotId;

    beforeEach(async () => {
      const { user: doc, slot } = await createDoctorWithSlot(24);
      const { token } = await createPatientAndLogin();
      patientToken = token;
      docId = doc.id;
      slotId = slot._id.toString();
    });

    it('returns 400 when body is not an object (e.g. array)', async () => {
      const res = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .send([]);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when doctorId is missing', async () => {
      const res = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ slotId });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when slotId is missing', async () => {
      const res = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ doctorId: docId });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when doctorId is not a string (e.g. object)', async () => {
      const res = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ doctorId: { $ne: null }, slotId });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when slotId is not a string (e.g. number)', async () => {
      const res = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ doctorId: docId, slotId: 123456 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when doctorId is an invalid ObjectId', async () => {
      const res = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ doctorId: 'invalid-doc-id', slotId });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when slotId is an invalid ObjectId', async () => {
      const res = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ doctorId: docId, slotId: 'short123' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when patientId is sent in request body', async () => {
      const res = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ doctorId: docId, slotId, patientId: new mongoose.Types.ObjectId().toString() });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toContain('patientId');
    });

    it('returns 400 when status is sent in request body', async () => {
      const res = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ doctorId: docId, slotId, status: 'confirmed' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toContain('status');
    });

    it('returns 400 when an unexpected property is sent in request body', async () => {
      const res = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ doctorId: docId, slotId, extraField: 'hacker' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when startTime is an impossible calendar date (e.g. Feb 31)', async () => {
      const res = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ doctorId: docId, slotId, startTime: '2026-02-31T10:00:00.000Z' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toContain('impossible');
    });

    it('returns 400 when the slot time is in the past', async () => {
      // Create a slot in the past directly in DB
      const pastStart = new Date(Date.now() - 2 * 3600 * 1000);
      const pastEnd = new Date(Date.now() - 1.5 * 3600 * 1000);
      const pastSlot = await Slot.create({
        doctor: docId,
        startTime: pastStart,
        endTime: pastEnd,
        isBooked: false,
      });

      const res = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ doctorId: docId, slotId: pastSlot._id.toString() });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toContain('past');
    });
  });

  describe('Doctor checks (404 NOT_FOUND)', () => {
    let patientToken;
    let slotId;

    beforeEach(async () => {
      const { slot } = await createDoctorWithSlot(24);
      const { token } = await createPatientAndLogin();
      patientToken = token;
      slotId = slot._id.toString();
    });

    it('returns 404 NOT_FOUND when doctorId does not exist', async () => {
      const nonExistentDocId = new mongoose.Types.ObjectId().toString();

      const res = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ doctorId: nonExistentDocId, slotId });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
      expect(res.body.message).toBe('Doctor not found');
    });

    it('returns 404 NOT_FOUND when doctorId belongs to a patient instead of a doctor', async () => {
      const anotherPatient = await createPatientAndLogin();

      const res = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ doctorId: anotherPatient.user.id, slotId });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
      expect(res.body.message).toBe('Doctor not found');
    });

    it('returns 404 NOT_FOUND when the doctor account is inactive (isActive: false)', async () => {
      const { user: doc } = await createDoctorWithSlot(24);
      await Doctor.findByIdAndUpdate(doc.id, { isActive: false });

      const res = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ doctorId: doc.id, slotId });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
      expect(res.body.message).toBe('Doctor not found');
    });
  });

  describe('Slot checks (404 NOT_FOUND & 409 SLOT_TAKEN)', () => {
    let patientToken;
    let doc;
    let slot;

    beforeEach(async () => {
      const docData = await createDoctorWithSlot(24);
      doc = docData.user;
      slot = docData.slot;
      const pat = await createPatientAndLogin();
      patientToken = pat.token;
    });

    it('returns 404 NOT_FOUND when slotId does not exist', async () => {
      const nonExistentSlotId = new mongoose.Types.ObjectId().toString();

      const res = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ doctorId: doc.id, slotId: nonExistentSlotId });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
      expect(res.body.message).toContain('Slot not found');
    });

    it('returns 404 NOT_FOUND when the slot belongs to another doctor', async () => {
      // Create Doctor B with a slot
      const docB = await createDoctorWithSlot(24, false);

      // Patient requests Doctor A with Doctor B's slot
      const res = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ doctorId: doc.id, slotId: docB.slot._id.toString() });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
      expect(res.body.message).toBe('Slot not found for this doctor');
    });

    it('returns 409 SLOT_TAKEN when the slot is already booked and does not create an appointment', async () => {
      // Pre-mark the slot as booked
      await Slot.findByIdAndUpdate(slot._id, { isBooked: true });

      const res = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ doctorId: doc.id, slotId: slot._id.toString() });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('SLOT_TAKEN');
      expect(res.body.message).toBe('This slot is already booked');

      // Verify no appointment was created
      const count = await Appointment.countDocuments();
      expect(count).toBe(0);
    });
  });

  describe('Concurrency & Double-Booking Prevention', () => {
    it('prevents double-booking when two patients attempt to book the same slot at the exact same moment', async () => {
      const { user: doc, slot } = await createDoctorWithSlot(24);

      const patient1 = await createPatientAndLogin();
      const patient2 = await createPatientAndLogin();

      // Run concurrent booking requests simultaneously via Promise.all
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/v1/appointments')
          .set('Authorization', `Bearer ${patient1.token}`)
          .send({ doctorId: doc.id, slotId: slot._id.toString() }),
        request(app)
          .post('/api/v1/appointments')
          .set('Authorization', `Bearer ${patient2.token}`)
          .send({ doctorId: doc.id, slotId: slot._id.toString() }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([201, 409]);

      const successRes = res1.status === 201 ? res1 : res2;
      const failureRes = res1.status === 409 ? res1 : res2;

      expect(successRes.body.appointment.status).toBe('requested');
      expect(failureRes.body.code).toBe('SLOT_TAKEN');

      // Verify exactly ONE appointment was created in DB
      const apptCount = await Appointment.countDocuments();
      expect(apptCount).toBe(1);

      // Verify slot is booked
      const updatedSlot = await Slot.findById(slot._id);
      expect(updatedSlot.isBooked).toBe(true);
    });
  });

  describe('Slot Release Rollback on Appointment Creation Failure', () => {
    it('releases the claimed slot (isBooked: false) if Appointment.create throws an error', async () => {
      const { user: doc, slot } = await createDoctorWithSlot(24);
      const { token: patientToken } = await createPatientAndLogin();

      // Silence console.error from errorHandler during intentional 500 test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // Spy on Appointment.create and mock a failure
      const createSpy = jest
        .spyOn(Appointment, 'create')
        .mockRejectedValueOnce(new Error('Simulated database write error'));

      const res = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ doctorId: doc.id, slotId: slot._id.toString() });

      expect(res.status).toBe(500);

      // Verify the slot was released back to isBooked: false
      const slotAfter = await Slot.findById(slot._id);
      expect(slotAfter.isBooked).toBe(false);

      // Verify no appointment was created
      const count = await Appointment.countDocuments();
      expect(count).toBe(0);

      createSpy.mockRestore();
      consoleSpy.mockRestore();
    });

    it('releases the claimed slot and returns 409 if partial unique index triggers E11000 duplicate key', async () => {
      const { user: doc, slot } = await createDoctorWithSlot(24);
      const { token: patientToken } = await createPatientAndLogin();

      const dupError = new Error('E11000 duplicate key error collection');
      dupError.code = 11000;

      const createSpy = jest
        .spyOn(Appointment, 'create')
        .mockRejectedValueOnce(dupError);

      const res = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ doctorId: doc.id, slotId: slot._id.toString() });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('SLOT_TAKEN');

      // Verify slot was released back to isBooked: false
      const slotAfter = await Slot.findById(slot._id);
      expect(slotAfter.isBooked).toBe(false);

      createSpy.mockRestore();
    });
  });
});
