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

jest.setTimeout(25000);

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
    dateOfBirth: '1995-05-15',
    address: '123 Baker Street',
    ...overrides,
  };
}

function doctorData(overrides = {}) {
  userSeq += 1;
  return {
    role: 'doctor',
    name: `Dr. Doctor ${userSeq}`,
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

async function bookAppointment(patientToken, doctorId, slotId) {
  const res = await request(app)
    .post('/api/v1/appointments')
    .set('Authorization', `Bearer ${patientToken}`)
    .send({ doctorId, slotId });
  expect(res.status).toBe(201);
  return res.body.appointment;
}

// ---------- Test Suites ----------

describe('Appointment Management & History (FR-09 & FR-10)', () => {
  describe('GET /api/v1/appointments (Appointment History)', () => {
    it('rejects unauthenticated requests with 401 UNAUTHORIZED', async () => {
      const res = await request(app).get('/api/v1/appointments');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('rejects admin users with 403 FORBIDDEN', async () => {
      const { token: adminToken } = await createAdminAndLogin();
      const res = await request(app)
        .get('/api/v1/appointments')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('rejects unknown query parameters with 400 VALIDATION_ERROR', async () => {
      const { token } = await createPatientAndLogin();
      const res = await request(app)
        .get('/api/v1/appointments?unknownParam=true')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toMatch(/unknown query parameter/i);
    });

    it('rejects invalid status filter with 400 VALIDATION_ERROR', async () => {
      const { token } = await createPatientAndLogin();
      const res = await request(app)
        .get('/api/v1/appointments?status=unknown')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toMatch(/status must be one of/i);
    });

    it('rejects invalid when filter with 400 VALIDATION_ERROR', async () => {
      const { token } = await createPatientAndLogin();
      const res = await request(app)
        .get('/api/v1/appointments?when=yesterday')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toMatch(/when must be one of/i);
    });

    it('rejects invalid pagination values with 400 VALIDATION_ERROR', async () => {
      const { token } = await createPatientAndLogin();
      const badPage = await request(app)
        .get('/api/v1/appointments?page=0')
        .set('Authorization', `Bearer ${token}`);
      expect(badPage.status).toBe(400);
      expect(badPage.body.code).toBe('VALIDATION_ERROR');

      const badLimit = await request(app)
        .get('/api/v1/appointments?limit=100')
        .set('Authorization', `Bearer ${token}`);
      expect(badLimit.status).toBe(400);
      expect(badLimit.body.code).toBe('VALIDATION_ERROR');
    });

    it('allows a patient to view only their own appointments and populates doctor { id, name } with no sensitive info', async () => {
      const doc1 = await createDoctorWithSlot(24);
      const doc2 = await createDoctorWithSlot(48);
      const pat1 = await createPatientAndLogin();
      const pat2 = await createPatientAndLogin();

      await bookAppointment(pat1.token, doc1.user.id, doc1.slot._id.toString());
      await bookAppointment(pat2.token, doc2.user.id, doc2.slot._id.toString());

      const res = await request(app)
        .get('/api/v1/appointments')
        .set('Authorization', `Bearer ${pat1.token}`);

      expect(res.status).toBe(200);
      expect(res.body.appointments).toHaveLength(1);
      const apt = res.body.appointments[0];
      expect(apt.doctor).toEqual({
        id: doc1.user.id,
        name: doc1.user.name,
      });
      expect(apt.doctor.email).toBeUndefined();
      expect(apt.doctor.phone).toBeUndefined();
      expect(apt.doctor.passwordHash).toBeUndefined();
      expect(res.body.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      });
    });

    it('allows a doctor to view only their own appointments and populates patient { id, name } with no sensitive info', async () => {
      const doc1 = await createDoctorWithSlot(24);
      const doc2 = await createDoctorWithSlot(48);
      const pat = await createPatientAndLogin();

      await bookAppointment(pat.token, doc1.user.id, doc1.slot._id.toString());
      await bookAppointment(pat.token, doc2.user.id, doc2.slot._id.toString());

      const res = await request(app)
        .get('/api/v1/appointments')
        .set('Authorization', `Bearer ${doc1.token}`);

      expect(res.status).toBe(200);
      expect(res.body.appointments).toHaveLength(1);
      const apt = res.body.appointments[0];
      expect(apt.patient).toEqual({
        id: pat.user.id,
        name: pat.user.name,
      });
      expect(apt.patient.email).toBeUndefined();
      expect(apt.patient.phone).toBeUndefined();
      expect(apt.patient.passwordHash).toBeUndefined();
    });

    it('filters by when=upcoming (dateTime >= now) sorted ascending and when=past (dateTime < now) sorted descending', async () => {
      const doc = await createDoctorAndLogin();
      const pat = await createPatientAndLogin();

      // Create a past slot & appointment
      const pastStart = new Date(Date.now() - 48 * 3600 * 1000);
      const pastEnd = new Date(pastStart.getTime() + 30 * 60 * 1000);
      const pastSlot = await Slot.create({
        doctor: doc.user.id,
        startTime: pastStart,
        endTime: pastEnd,
        isBooked: true,
      });
      await Appointment.create({
        patient: pat.user.id,
        doctor: doc.user.id,
        slot: pastSlot._id,
        dateTime: pastStart,
        endTime: pastEnd,
        status: 'completed',
      });

      // Create two future slots & appointments: 24h ahead and 48h ahead
      const slot24 = await Slot.create({
        doctor: doc.user.id,
        startTime: new Date(Date.now() + 24 * 3600 * 1000),
        endTime: new Date(Date.now() + 24 * 3600 * 1000 + 30 * 60 * 1000),
        isBooked: true,
      });
      await Appointment.create({
        patient: pat.user.id,
        doctor: doc.user.id,
        slot: slot24._id,
        dateTime: slot24.startTime,
        endTime: slot24.endTime,
        status: 'confirmed',
      });

      const slot48 = await Slot.create({
        doctor: doc.user.id,
        startTime: new Date(Date.now() + 48 * 3600 * 1000),
        endTime: new Date(Date.now() + 48 * 3600 * 1000 + 30 * 60 * 1000),
        isBooked: true,
      });
      await Appointment.create({
        patient: pat.user.id,
        doctor: doc.user.id,
        slot: slot48._id,
        dateTime: slot48.startTime,
        endTime: slot48.endTime,
        status: 'requested',
      });

      // when=upcoming -> 2 appointments, soonest first (slot24 then slot48)
      const upcomingRes = await request(app)
        .get('/api/v1/appointments?when=upcoming')
        .set('Authorization', `Bearer ${pat.token}`);
      expect(upcomingRes.status).toBe(200);
      expect(upcomingRes.body.appointments).toHaveLength(2);
      expect(new Date(upcomingRes.body.appointments[0].dateTime).getTime()).toBeLessThan(
        new Date(upcomingRes.body.appointments[1].dateTime).getTime()
      );

      // when=past -> 1 appointment
      const pastRes = await request(app)
        .get('/api/v1/appointments?when=past')
        .set('Authorization', `Bearer ${pat.token}`);
      expect(pastRes.status).toBe(200);
      expect(pastRes.body.appointments).toHaveLength(1);
      expect(pastRes.body.appointments[0].status).toBe('completed');

      // Combined when=upcoming & status=confirmed -> exactly 1 appointment
      const combinedRes = await request(app)
        .get('/api/v1/appointments?when=upcoming&status=confirmed')
        .set('Authorization', `Bearer ${pat.token}`);
      expect(combinedRes.status).toBe(200);
      expect(combinedRes.body.appointments).toHaveLength(1);
      expect(combinedRes.body.appointments[0].status).toBe('confirmed');
    });
  });

  describe('PATCH /api/v1/appointments/:id – Cancel (Patient)', () => {
    it('allows a patient to cancel their own requested appointment and frees the slot', async () => {
      const doc = await createDoctorWithSlot(24);
      const pat = await createPatientAndLogin();
      const booked = await bookAppointment(pat.token, doc.user.id, doc.slot._id.toString());

      const res = await request(app)
        .patch(`/api/v1/appointments/${booked.id}`)
        .set('Authorization', `Bearer ${pat.token}`)
        .send({ action: 'cancel' });

      expect(res.status).toBe(200);
      expect(res.body.appointment.status).toBe('cancelled');
      expect(res.body.appointment.doctor).toEqual({ id: doc.user.id, name: doc.user.name });

      // Verify the slot is released
      const slotDoc = await Slot.findById(doc.slot._id);
      expect(slotDoc.isBooked).toBe(false);
    });

    it('allows a patient to cancel a confirmed appointment and frees the slot', async () => {
      const doc = await createDoctorWithSlot(24);
      const pat = await createPatientAndLogin();
      const booked = await bookAppointment(pat.token, doc.user.id, doc.slot._id.toString());

      // Doctor accepts first
      await request(app)
        .patch(`/api/v1/appointments/${booked.id}`)
        .set('Authorization', `Bearer ${doc.token}`)
        .send({ action: 'accept' });

      // Patient cancels confirmed appointment
      const res = await request(app)
        .patch(`/api/v1/appointments/${booked.id}`)
        .set('Authorization', `Bearer ${pat.token}`)
        .send({ action: 'cancel' });

      expect(res.status).toBe(200);
      expect(res.body.appointment.status).toBe('cancelled');
      const slotDoc = await Slot.findById(doc.slot._id);
      expect(slotDoc.isBooked).toBe(false);
    });

    it('rejects cancellation if the appointment is already cancelled (400 VALIDATION_ERROR)', async () => {
      const doc = await createDoctorWithSlot(24);
      const pat = await createPatientAndLogin();
      const booked = await bookAppointment(pat.token, doc.user.id, doc.slot._id.toString());

      // Cancel once
      await request(app)
        .patch(`/api/v1/appointments/${booked.id}`)
        .set('Authorization', `Bearer ${pat.token}`)
        .send({ action: 'cancel' });

      // Cancel twice
      const res = await request(app)
        .patch(`/api/v1/appointments/${booked.id}`)
        .set('Authorization', `Bearer ${pat.token}`)
        .send({ action: 'cancel' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toMatch(/already cancelled/i);
    });

    it('rejects cancellation of a past appointment (400 VALIDATION_ERROR)', async () => {
      const doc = await createDoctorAndLogin();
      const pat = await createPatientAndLogin();
      const pastStart = new Date(Date.now() - 2 * 3600 * 1000);
      const pastEnd = new Date(pastStart.getTime() + 30 * 60 * 1000);

      const pastSlot = await Slot.create({
        doctor: doc.user.id,
        startTime: pastStart,
        endTime: pastEnd,
        isBooked: true,
      });

      const pastApt = await Appointment.create({
        patient: pat.user.id,
        doctor: doc.user.id,
        slot: pastSlot._id,
        dateTime: pastStart,
        endTime: pastEnd,
        status: 'requested',
      });

      const res = await request(app)
        .patch(`/api/v1/appointments/${pastApt._id}`)
        .set('Authorization', `Bearer ${pat.token}`)
        .send({ action: 'cancel' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toMatch(/past or ongoing/i);
    });

    it('returns 404 NOT_FOUND when a patient attempts to cancel an appointment of another patient', async () => {
      const doc = await createDoctorWithSlot(24);
      const pat1 = await createPatientAndLogin();
      const pat2 = await createPatientAndLogin();
      const booked = await bookAppointment(pat1.token, doc.user.id, doc.slot._id.toString());

      const res = await request(app)
        .patch(`/api/v1/appointments/${booked.id}`)
        .set('Authorization', `Bearer ${pat2.token}`)
        .send({ action: 'cancel' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('returns 403 FORBIDDEN when a doctor attempts to cancel an appointment', async () => {
      const doc = await createDoctorWithSlot(24);
      const pat = await createPatientAndLogin();
      const booked = await bookAppointment(pat.token, doc.user.id, doc.slot._id.toString());

      const res = await request(app)
        .patch(`/api/v1/appointments/${booked.id}`)
        .set('Authorization', `Bearer ${doc.token}`)
        .send({ action: 'cancel' });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });
  });

  describe('PATCH /api/v1/appointments/:id – Accept & Reject (Doctor)', () => {
    it('allows a doctor to accept a requested appointment and marks it confirmed', async () => {
      const doc = await createDoctorWithSlot(24);
      const pat = await createPatientAndLogin();
      const booked = await bookAppointment(pat.token, doc.user.id, doc.slot._id.toString());

      const res = await request(app)
        .patch(`/api/v1/appointments/${booked.id}`)
        .set('Authorization', `Bearer ${doc.token}`)
        .send({ action: 'accept' });

      expect(res.status).toBe(200);
      expect(res.body.appointment.status).toBe('confirmed');
      expect(res.body.appointment.patient).toEqual({ id: pat.user.id, name: pat.user.name });
    });

    it('rejects accept when appointment is already confirmed (400 VALIDATION_ERROR)', async () => {
      const doc = await createDoctorWithSlot(24);
      const pat = await createPatientAndLogin();
      const booked = await bookAppointment(pat.token, doc.user.id, doc.slot._id.toString());

      await request(app)
        .patch(`/api/v1/appointments/${booked.id}`)
        .set('Authorization', `Bearer ${doc.token}`)
        .send({ action: 'accept' });

      const res = await request(app)
        .patch(`/api/v1/appointments/${booked.id}`)
        .set('Authorization', `Bearer ${doc.token}`)
        .send({ action: 'accept' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toMatch(/already confirmed/i);
    });

    it('allows a doctor to reject a requested appointment and frees the slot', async () => {
      const doc = await createDoctorWithSlot(24);
      const pat = await createPatientAndLogin();
      const booked = await bookAppointment(pat.token, doc.user.id, doc.slot._id.toString());

      const res = await request(app)
        .patch(`/api/v1/appointments/${booked.id}`)
        .set('Authorization', `Bearer ${doc.token}`)
        .send({ action: 'reject' });

      expect(res.status).toBe(200);
      expect(res.body.appointment.status).toBe('cancelled');
      const slotDoc = await Slot.findById(doc.slot._id);
      expect(slotDoc.isBooked).toBe(false);
    });

    it('rejects rejection of an already confirmed appointment (400 VALIDATION_ERROR)', async () => {
      const doc = await createDoctorWithSlot(24);
      const pat = await createPatientAndLogin();
      const booked = await bookAppointment(pat.token, doc.user.id, doc.slot._id.toString());

      await request(app)
        .patch(`/api/v1/appointments/${booked.id}`)
        .set('Authorization', `Bearer ${doc.token}`)
        .send({ action: 'accept' });

      const res = await request(app)
        .patch(`/api/v1/appointments/${booked.id}`)
        .set('Authorization', `Bearer ${doc.token}`)
        .send({ action: 'reject' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toMatch(/already confirmed/i);
    });

    it('returns 404 NOT_FOUND when a doctor attempts to accept/reject an appointment of another doctor', async () => {
      const doc1 = await createDoctorWithSlot(24);
      const doc2 = await createDoctorAndLogin();
      const pat = await createPatientAndLogin();
      const booked = await bookAppointment(pat.token, doc1.user.id, doc1.slot._id.toString());

      const res = await request(app)
        .patch(`/api/v1/appointments/${booked.id}`)
        .set('Authorization', `Bearer ${doc2.token}`)
        .send({ action: 'accept' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('returns 403 FORBIDDEN when a patient attempts to accept or reject an appointment', async () => {
      const doc = await createDoctorWithSlot(24);
      const pat = await createPatientAndLogin();
      const booked = await bookAppointment(pat.token, doc.user.id, doc.slot._id.toString());

      const res = await request(app)
        .patch(`/api/v1/appointments/${booked.id}`)
        .set('Authorization', `Bearer ${pat.token}`)
        .send({ action: 'accept' });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });
  });

  describe('PATCH /api/v1/appointments/:id – Reschedule (Patient)', () => {
    it('allows a patient to reschedule to an open future slot of the same doctor, claims new slot, frees old slot, and resets status to requested', async () => {
      const doc = await createDoctorWithSlot(24);
      // Create slot 2 for same doctor 48h ahead
      const times2 = makeFutureSlotDates(48);
      const slot2 = await Slot.create({
        doctor: doc.user.id,
        startTime: times2.startTime,
        endTime: times2.endTime,
        isBooked: false,
      });

      const pat = await createPatientAndLogin();
      const booked = await bookAppointment(pat.token, doc.user.id, doc.slot._id.toString());

      // Doctor accepted it initially
      await request(app)
        .patch(`/api/v1/appointments/${booked.id}`)
        .set('Authorization', `Bearer ${doc.token}`)
        .send({ action: 'accept' });

      // Patient reschedules
      const res = await request(app)
        .patch(`/api/v1/appointments/${booked.id}`)
        .set('Authorization', `Bearer ${pat.token}`)
        .send({ action: 'reschedule', slotId: slot2._id.toString() });

      expect(res.status).toBe(200);
      expect(res.body.appointment.status).toBe('requested');
      expect(res.body.appointment.dateTime).toBe(times2.startTimeIso);

      // Verify old slot is freed and new slot is booked
      const oldSlotDoc = await Slot.findById(doc.slot._id);
      expect(oldSlotDoc.isBooked).toBe(false);

      const newSlotDoc = await Slot.findById(slot2._id);
      expect(newSlotDoc.isBooked).toBe(true);
    });

    it('rejects reschedule if target slot is already booked with 409 SLOT_TAKEN', async () => {
      const doc = await createDoctorWithSlot(24);
      const times2 = makeFutureSlotDates(48);
      const slot2 = await Slot.create({
        doctor: doc.user.id,
        startTime: times2.startTime,
        endTime: times2.endTime,
        isBooked: true, // already booked!
      });

      const pat = await createPatientAndLogin();
      const booked = await bookAppointment(pat.token, doc.user.id, doc.slot._id.toString());

      const res = await request(app)
        .patch(`/api/v1/appointments/${booked.id}`)
        .set('Authorization', `Bearer ${pat.token}`)
        .send({ action: 'reschedule', slotId: slot2._id.toString() });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('SLOT_TAKEN');
    });

    it('rejects reschedule if target slot belongs to a different doctor (400 VALIDATION_ERROR)', async () => {
      const doc1 = await createDoctorWithSlot(24);
      const doc2 = await createDoctorWithSlot(48);

      const pat = await createPatientAndLogin();
      const booked = await bookAppointment(pat.token, doc1.user.id, doc1.slot._id.toString());

      const res = await request(app)
        .patch(`/api/v1/appointments/${booked.id}`)
        .set('Authorization', `Bearer ${pat.token}`)
        .send({ action: 'reschedule', slotId: doc2.slot._id.toString() });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toMatch(/same doctor/i);
    });

    it('rejects reschedule to the exact same slot (400 VALIDATION_ERROR)', async () => {
      const doc = await createDoctorWithSlot(24);
      const pat = await createPatientAndLogin();
      const booked = await bookAppointment(pat.token, doc.user.id, doc.slot._id.toString());

      const res = await request(app)
        .patch(`/api/v1/appointments/${booked.id}`)
        .set('Authorization', `Bearer ${pat.token}`)
        .send({ action: 'reschedule', slotId: doc.slot._id.toString() });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toMatch(/same slot/i);
    });
  });

  describe('PATCH /api/v1/appointments/:id – Complete (Doctor)', () => {
    it('rejects premature completion before the scheduled start time (400 VALIDATION_ERROR)', async () => {
      const doc = await createDoctorWithSlot(24);
      const pat = await createPatientAndLogin();
      const booked = await bookAppointment(pat.token, doc.user.id, doc.slot._id.toString());

      // Accept first
      await request(app)
        .patch(`/api/v1/appointments/${booked.id}`)
        .set('Authorization', `Bearer ${doc.token}`)
        .send({ action: 'accept' });

      // Attempt premature completion
      const res = await request(app)
        .patch(`/api/v1/appointments/${booked.id}`)
        .set('Authorization', `Bearer ${doc.token}`)
        .send({ action: 'complete' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toMatch(/before its scheduled start time/i);
    });

    it('allows a doctor to complete a confirmed appointment whose start time is in the past', async () => {
      const doc = await createDoctorAndLogin();
      const pat = await createPatientAndLogin();
      const pastStart = new Date(Date.now() - 3600 * 1000);
      const pastEnd = new Date(pastStart.getTime() + 30 * 60 * 1000);

      const pastSlot = await Slot.create({
        doctor: doc.user.id,
        startTime: pastStart,
        endTime: pastEnd,
        isBooked: true,
      });

      const confirmedApt = await Appointment.create({
        patient: pat.user.id,
        doctor: doc.user.id,
        slot: pastSlot._id,
        dateTime: pastStart,
        endTime: pastEnd,
        status: 'confirmed',
      });

      const res = await request(app)
        .patch(`/api/v1/appointments/${confirmedApt._id}`)
        .set('Authorization', `Bearer ${doc.token}`)
        .send({ action: 'complete' });

      expect(res.status).toBe(200);
      expect(res.body.appointment.status).toBe('completed');
      expect(res.body.appointment.patient).toEqual({ id: pat.user.id, name: pat.user.name });

      // Completed appointment keeps slot booked
      const slotDoc = await Slot.findById(pastSlot._id);
      expect(slotDoc.isBooked).toBe(true);
    });

    it('rejects completion of an unconfirmed (requested) appointment (400 VALIDATION_ERROR)', async () => {
      const doc = await createDoctorAndLogin();
      const pat = await createPatientAndLogin();
      const pastStart = new Date(Date.now() - 3600 * 1000);
      const pastEnd = new Date(pastStart.getTime() + 30 * 60 * 1000);

      const pastSlot = await Slot.create({
        doctor: doc.user.id,
        startTime: pastStart,
        endTime: pastEnd,
        isBooked: true,
      });

      const reqApt = await Appointment.create({
        patient: pat.user.id,
        doctor: doc.user.id,
        slot: pastSlot._id,
        dateTime: pastStart,
        endTime: pastEnd,
        status: 'requested',
      });

      const res = await request(app)
        .patch(`/api/v1/appointments/${reqApt._id}`)
        .set('Authorization', `Bearer ${doc.token}`)
        .send({ action: 'complete' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toMatch(/unconfirmed appointment/i);
    });
  });

  describe('General validation & authorization', () => {
    it('rejects unsupported action words with 400 VALIDATION_ERROR', async () => {
      const doc = await createDoctorWithSlot(24);
      const pat = await createPatientAndLogin();
      const booked = await bookAppointment(pat.token, doc.user.id, doc.slot._id.toString());

      const res = await request(app)
        .patch(`/api/v1/appointments/${booked.id}`)
        .set('Authorization', `Bearer ${pat.token}`)
        .send({ action: 'dance' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toMatch(/action must be one of/i);
    });

    it('rejects unknown fields in PATCH body with 400 VALIDATION_ERROR', async () => {
      const doc = await createDoctorWithSlot(24);
      const pat = await createPatientAndLogin();
      const booked = await bookAppointment(pat.token, doc.user.id, doc.slot._id.toString());

      const res = await request(app)
        .patch(`/api/v1/appointments/${booked.id}`)
        .set('Authorization', `Bearer ${pat.token}`)
        .send({ action: 'cancel', hackerParam: 'foo' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toMatch(/unknown field/i);
    });

    it('rejects non-existent appointment ID with 404 NOT_FOUND', async () => {
      const pat = await createPatientAndLogin();
      const randomId = new mongoose.Types.ObjectId().toString();

      const res = await request(app)
        .patch(`/api/v1/appointments/${randomId}`)
        .set('Authorization', `Bearer ${pat.token}`)
        .send({ action: 'cancel' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('rejects malformed appointment ID with 400 VALIDATION_ERROR', async () => {
      const pat = await createPatientAndLogin();

      const res = await request(app)
        .patch('/api/v1/appointments/not-a-valid-id')
        .set('Authorization', `Bearer ${pat.token}`)
        .send({ action: 'cancel' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toMatch(/invalid appointment id/i);
    });
  });
});
