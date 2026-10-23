process.env.JWT_SECRET = 'test-secret-for-availability-tests';
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
const { connectTestDB, clearTestDB, closeTestDB } = require('./helpers/db');

jest.setTimeout(20000);

beforeAll(async () => {
  await connectTestDB();
  await User.init();
  await Slot.init();
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
    name: 'Test Patient',
    email: 'patient@example.com',
    phone: '+911234567890',
    password: PASSWORD,
    dateOfBirth: '1995-05-15',
    address: '123 Baker Street',
    ...overrides,
  };
}

function doctorData(overrides = {}) {
  return {
    role: 'doctor',
    name: 'Dr. Test Doctor',
    email: 'doctor@example.com',
    phone: '+919876543210',
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

// Generates an ISO UTC 30-minute slot relative to now
function makeFutureSlot(daysFromNow = 1, hour = 9, minute = 0) {
  const start = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  start.setUTCHours(hour, minute, 0, 0);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  return {
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  };
}

const getMyAvailability = (token) => {
  let req = request(app).get('/api/v1/doctors/me/availability');
  if (token) req = req.set('Authorization', `Bearer ${token}`);
  return req;
};

const putMyAvailability = (token, body) => {
  let req = request(app).put('/api/v1/doctors/me/availability');
  if (token) req = req.set('Authorization', `Bearer ${token}`);
  return req.send(body);
};

const getDoctorAvailability = (token, doctorId) => {
  let req = request(app).get(`/api/v1/doctors/${doctorId}/availability`);
  if (token) req = req.set('Authorization', `Bearer ${token}`);
  return req;
};

// =========================================================================
// 1. GET /api/v1/doctors/me/availability
// =========================================================================

describe('GET /api/v1/doctors/me/availability', () => {
  it('returns 401 UNAUTHORIZED when no token is provided', async () => {
    const res = await getMyAvailability(null);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 INVALID_TOKEN for an invalid token', async () => {
    const res = await getMyAvailability('invalid.token.here');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });

  it('returns 403 FORBIDDEN when a patient accesses the route', async () => {
    const { token } = await createPatientAndLogin();
    const res = await getMyAvailability(token);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('returns 403 FORBIDDEN when an admin accesses the route', async () => {
    const { token } = await createAdminAndLogin();
    const res = await getMyAvailability(token);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('returns 403 ACCOUNT_DISABLED when the doctor account is inactive', async () => {
    const { token, user } = await createDoctorAndLogin();
    await User.findByIdAndUpdate(user.id, { isActive: false });

    const res = await getMyAvailability(token);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_DISABLED');
  });

  it('returns empty slots array when doctor has no slots', async () => {
    const { token } = await createDoctorAndLogin();
    const res = await getMyAvailability(token);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ slots: [] });
  });

  it('returns doctor future slots (both open and booked), sorted by startTime', async () => {
    const { token, user } = await createDoctorAndLogin();

    const slot1 = makeFutureSlot(1, 10, 0);
    const slot2 = makeFutureSlot(1, 9, 0); // Earlier slot
    const slot3 = makeFutureSlot(2, 14, 0); // Booked slot

    // Create directly in DB
    await Slot.create({
      doctor: user.id,
      startTime: new Date(slot1.startTime),
      endTime: new Date(slot1.endTime),
      isBooked: false,
    });
    await Slot.create({
      doctor: user.id,
      startTime: new Date(slot2.startTime),
      endTime: new Date(slot2.endTime),
      isBooked: false,
    });
    await Slot.create({
      doctor: user.id,
      startTime: new Date(slot3.startTime),
      endTime: new Date(slot3.endTime),
      isBooked: true,
    });

    const res = await getMyAvailability(token);

    expect(res.status).toBe(200);
    expect(res.body.slots).toHaveLength(3);

    // Verify sorted ascending: slot2 (09:00), slot1 (10:00), slot3 (next day)
    expect(res.body.slots[0].startTime).toBe(slot2.startTime);
    expect(res.body.slots[0].isBooked).toBe(false);
    expect(res.body.slots[1].startTime).toBe(slot1.startTime);
    expect(res.body.slots[1].isBooked).toBe(false);
    expect(res.body.slots[2].startTime).toBe(slot3.startTime);
    expect(res.body.slots[2].isBooked).toBe(true);
  });

  it('does not return past slots', async () => {
    const { token, user } = await createDoctorAndLogin();

    const pastStart = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const pastEnd = new Date(pastStart.getTime() + 30 * 60 * 1000);
    const futureSlot = makeFutureSlot(1, 9, 0);

    await Slot.create({
      doctor: user.id,
      startTime: pastStart,
      endTime: pastEnd,
      isBooked: false,
    });
    await Slot.create({
      doctor: user.id,
      startTime: new Date(futureSlot.startTime),
      endTime: new Date(futureSlot.endTime),
      isBooked: false,
    });

    const res = await getMyAvailability(token);
    expect(res.status).toBe(200);
    expect(res.body.slots).toHaveLength(1);
    expect(res.body.slots[0].startTime).toBe(futureSlot.startTime);
  });

  it('does not return another doctor slots', async () => {
    const doc1 = await createDoctorAndLogin({ email: 'doc1@example.com' });
    const doc2 = await createDoctorAndLogin({ email: 'doc2@example.com' });

    const slotDoc1 = makeFutureSlot(1, 9, 0);
    const slotDoc2 = makeFutureSlot(1, 10, 0);

    await Slot.create({
      doctor: doc1.user.id,
      startTime: new Date(slotDoc1.startTime),
      endTime: new Date(slotDoc1.endTime),
      isBooked: false,
    });
    await Slot.create({
      doctor: doc2.user.id,
      startTime: new Date(slotDoc2.startTime),
      endTime: new Date(slotDoc2.endTime),
      isBooked: false,
    });

    const res = await getMyAvailability(doc1.token);
    expect(res.status).toBe(200);
    expect(res.body.slots).toHaveLength(1);
    expect(res.body.slots[0].startTime).toBe(slotDoc1.startTime);
  });
});

// =========================================================================
// 2. PUT /api/v1/doctors/me/availability
// =========================================================================

describe('PUT /api/v1/doctors/me/availability', () => {
  it('returns 401 UNAUTHORIZED when no token is provided', async () => {
    const res = await putMyAvailability(null, { slots: [] });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 FORBIDDEN when a patient tries to update availability', async () => {
    const { token } = await createPatientAndLogin();
    const res = await putMyAvailability(token, { slots: [] });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('returns 403 FORBIDDEN when an admin tries to update availability', async () => {
    const { token } = await createAdminAndLogin();
    const res = await putMyAvailability(token, { slots: [] });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('sets availability slots and returns the list of slots', async () => {
    const { token } = await createDoctorAndLogin();

    const slot1 = makeFutureSlot(1, 9, 0);
    const slot2 = makeFutureSlot(1, 9, 30);

    const res = await putMyAvailability(token, {
      slots: [slot1, slot2],
    });

    expect(res.status).toBe(200);
    expect(res.body.slots).toHaveLength(2);
    expect(res.body.slots[0].startTime).toBe(slot1.startTime);
    expect(res.body.slots[0].endTime).toBe(slot1.endTime);
    expect(res.body.slots[0].isBooked).toBe(false);
    expect(res.body.slots[0].id).toBeDefined();

    expect(res.body.slots[1].startTime).toBe(slot2.startTime);
    expect(res.body.slots[1].endTime).toBe(slot2.endTime);
    expect(res.body.slots[1].isBooked).toBe(false);
  });

  it('replaces existing unbooked future slots with the new list', async () => {
    const { token, user } = await createDoctorAndLogin();

    const oldSlot = makeFutureSlot(1, 9, 0);
    await Slot.create({
      doctor: user.id,
      startTime: new Date(oldSlot.startTime),
      endTime: new Date(oldSlot.endTime),
      isBooked: false,
    });

    const newSlot1 = makeFutureSlot(2, 10, 0);
    const newSlot2 = makeFutureSlot(2, 10, 30);

    const res = await putMyAvailability(token, {
      slots: [newSlot1, newSlot2],
    });

    expect(res.status).toBe(200);
    expect(res.body.slots).toHaveLength(2);
    expect(res.body.slots[0].startTime).toBe(newSlot1.startTime);
    expect(res.body.slots[1].startTime).toBe(newSlot2.startTime);

    // Old slot must be removed from DB
    const oldInDb = await Slot.findOne({ doctor: user.id, startTime: new Date(oldSlot.startTime) });
    expect(oldInDb).toBeNull();
  });

  it('allows clearing all unbooked slots with an empty array', async () => {
    const { token, user } = await createDoctorAndLogin();

    const slot = makeFutureSlot(1, 9, 0);
    await Slot.create({
      doctor: user.id,
      startTime: new Date(slot.startTime),
      endTime: new Date(slot.endTime),
      isBooked: false,
    });

    const res = await putMyAvailability(token, { slots: [] });

    expect(res.status).toBe(200);
    expect(res.body.slots).toEqual([]);

    const count = await Slot.countDocuments({ doctor: user.id });
    expect(count).toBe(0);
  });

  it('preserves booked slots even when they are omitted from the request', async () => {
    const { token, user } = await createDoctorAndLogin();

    // Create a booked slot directly through the model
    const bookedSlot = makeFutureSlot(1, 10, 0);
    await Slot.create({
      doctor: user.id,
      startTime: new Date(bookedSlot.startTime),
      endTime: new Date(bookedSlot.endTime),
      isBooked: true,
    });

    // Doctor sets availability for different times, omitting the booked slot
    const newSlot = makeFutureSlot(1, 11, 0);
    const res = await putMyAvailability(token, {
      slots: [newSlot],
    });

    expect(res.status).toBe(200);
    expect(res.body.slots).toHaveLength(2);

    // The booked slot remains preserved
    const foundBooked = res.body.slots.find((s) => s.startTime === bookedSlot.startTime);
    expect(foundBooked).toBeDefined();
    expect(foundBooked.isBooked).toBe(true);

    // DB still has the booked slot
    const dbBooked = await Slot.findOne({ doctor: user.id, startTime: new Date(bookedSlot.startTime) });
    expect(dbBooked).not.toBeNull();
    expect(dbBooked.isBooked).toBe(true);
  });

  it('rejects a slot that overlaps with an already booked slot', async () => {
    const { token, user } = await createDoctorAndLogin();

    const bookedSlot = makeFutureSlot(1, 10, 0);
    await Slot.create({
      doctor: user.id,
      startTime: new Date(bookedSlot.startTime),
      endTime: new Date(bookedSlot.endTime),
      isBooked: true,
    });

    // Try to submit an overlapping slot (same exact time)
    const res = await putMyAvailability(token, {
      slots: [bookedSlot],
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.message).toMatch(/already booked slot/i);
  });

  it('strictly updates the logged-in doctor even if a doctorId is smuggled into the body', async () => {
    const doc1 = await createDoctorAndLogin({ email: 'doc1@example.com' });
    const doc2 = await createDoctorAndLogin({ email: 'doc2@example.com' });

    const slot = makeFutureSlot(1, 9, 0);

    // Doc1 passes Doc2's ID in the body
    const res = await putMyAvailability(doc1.token, {
      doctorId: doc2.user.id,
      slots: [slot],
    });

    expect(res.status).toBe(200);

    // Doc1's slots were updated
    const doc1Slots = await Slot.find({ doctor: doc1.user.id });
    expect(doc1Slots).toHaveLength(1);

    // Doc2's slots were NOT touched
    const doc2Slots = await Slot.find({ doctor: doc2.user.id });
    expect(doc2Slots).toHaveLength(0);
  });

  describe('Validation errors (400 VALIDATION_ERROR)', () => {
    let doctorToken;

    beforeEach(async () => {
      const doc = await createDoctorAndLogin();
      doctorToken = doc.token;
    });

    it('rejects non-object body or missing slots property', async () => {
      const res1 = await putMyAvailability(doctorToken, {});
      expect(res1.status).toBe(400);
      expect(res1.body.code).toBe('VALIDATION_ERROR');

      const res2 = await putMyAvailability(doctorToken, { slots: 'not-an-array' });
      expect(res2.status).toBe(400);
      expect(res2.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects request with more than 50 slots', async () => {
      const slots = [];
      for (let i = 0; i < 51; i++) {
        const start = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + i * 30 * 60 * 1000);
        const end = new Date(start.getTime() + 30 * 60 * 1000);
        slots.push({ startTime: start.toISOString(), endTime: end.toISOString() });
      }

      const res = await putMyAvailability(doctorToken, { slots });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toMatch(/at most 50 slots/i);
    });

    it('rejects slot missing startTime or endTime', async () => {
      const valid = makeFutureSlot(1, 9, 0);
      const res1 = await putMyAvailability(doctorToken, {
        slots: [{ startTime: valid.startTime }],
      });
      expect(res1.status).toBe(400);
      expect(res1.body.code).toBe('VALIDATION_ERROR');

      const res2 = await putMyAvailability(doctorToken, {
        slots: [{ endTime: valid.endTime }],
      });
      expect(res2.status).toBe(400);
      expect(res2.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects slot with non-string types for dates (numbers, objects)', async () => {
      const valid = makeFutureSlot(1, 9, 0);

      const resNumber = await putMyAvailability(doctorToken, {
        slots: [{ startTime: Date.now() + 100000, endTime: valid.endTime }],
      });
      expect(resNumber.status).toBe(400);
      expect(resNumber.body.code).toBe('VALIDATION_ERROR');

      const resObj = await putMyAvailability(doctorToken, {
        slots: [{ startTime: { $gt: '' }, endTime: valid.endTime }],
      });
      expect(resObj.status).toBe(400);
      expect(resObj.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects slot with invalid ISO 8601 UTC format (missing Z or malformed)', async () => {
      const res = await putMyAvailability(doctorToken, {
        slots: [
          {
            startTime: '2026-11-02 04:30:00', // Missing T and Z
            endTime: '2026-11-02 05:00:00',
          },
        ],
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects impossible calendar dates (e.g. Feb 31)', async () => {
      const res = await putMyAvailability(doctorToken, {
        slots: [
          {
            startTime: '2026-02-31T09:00:00.000Z',
            endTime: '2026-02-31T09:30:00.000Z',
          },
        ],
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toMatch(/impossible calendar date/i);
    });

    it('rejects slot in the past', async () => {
      const pastStart = new Date(Date.now() - 3600 * 1000);
      const pastEnd = new Date(pastStart.getTime() + 30 * 60 * 1000);

      const res = await putMyAvailability(doctorToken, {
        slots: [
          {
            startTime: pastStart.toISOString(),
            endTime: pastEnd.toISOString(),
          },
        ],
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toMatch(/future/i);
    });

    it('rejects slot more than 60 days in the future', async () => {
      const futureStart = new Date(Date.now() + 61 * 24 * 60 * 60 * 1000);
      const futureEnd = new Date(futureStart.getTime() + 30 * 60 * 1000);

      const res = await putMyAvailability(doctorToken, {
        slots: [
          {
            startTime: futureStart.toISOString(),
            endTime: futureEnd.toISOString(),
          },
        ],
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toMatch(/60 days/i);
    });

    it('rejects slot duration not exactly 30 minutes', async () => {
      const start = new Date(Date.now() + 24 * 60 * 60 * 1000);

      // 15 minutes
      const res15 = await putMyAvailability(doctorToken, {
        slots: [
          {
            startTime: start.toISOString(),
            endTime: new Date(start.getTime() + 15 * 60 * 1000).toISOString(),
          },
        ],
      });
      expect(res15.status).toBe(400);
      expect(res15.body.code).toBe('VALIDATION_ERROR');

      // 45 minutes
      const res45 = await putMyAvailability(doctorToken, {
        slots: [
          {
            startTime: start.toISOString(),
            endTime: new Date(start.getTime() + 45 * 60 * 1000).toISOString(),
          },
        ],
      });
      expect(res45.status).toBe(400);
      expect(res45.body.code).toBe('VALIDATION_ERROR');

      // End time before start time
      const resInverted = await putMyAvailability(doctorToken, {
        slots: [
          {
            startTime: start.toISOString(),
            endTime: new Date(start.getTime() - 30 * 60 * 1000).toISOString(),
          },
        ],
      });
      expect(resInverted.status).toBe(400);
      expect(resInverted.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects overlapping slots within the same request', async () => {
      const start1 = new Date(Date.now() + 24 * 60 * 60 * 1000);
      start1.setUTCHours(9, 0, 0, 0);
      const end1 = new Date(start1.getTime() + 30 * 60 * 1000);

      // Overlapping slot: 09:15 - 09:45
      const start2 = new Date(start1.getTime() + 15 * 60 * 1000);
      const end2 = new Date(start2.getTime() + 30 * 60 * 1000);

      const res = await putMyAvailability(doctorToken, {
        slots: [
          { startTime: start1.toISOString(), endTime: end1.toISOString() },
          { startTime: start2.toISOString(), endTime: end2.toISOString() },
        ],
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toMatch(/cannot overlap/i);
    });

    it('rejects duplicate start times within the same request', async () => {
      const slot = makeFutureSlot(1, 9, 0);

      const res = await putMyAvailability(doctorToken, {
        slots: [slot, slot],
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toMatch(/cannot overlap/i);
    });
  });
});

// =========================================================================
// 3. GET /api/v1/doctors/:id/availability
// =========================================================================

describe('GET /api/v1/doctors/:id/availability', () => {
  let doctorUser;
  let patientToken;

  beforeEach(async () => {
    const doc = await createDoctorAndLogin({ email: 'doc.avail@example.com', name: 'Dr. John Watson' });
    doctorUser = doc.user;

    const patient = await createPatientAndLogin({ email: 'patient.viewer@example.com' });
    patientToken = patient.token;
  });

  it('returns 401 UNAUTHORIZED when no token is provided', async () => {
    const res = await getDoctorAvailability(null, doctorUser.id);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 FORBIDDEN when a doctor accesses another doctor availability endpoint', async () => {
    const anotherDoc = await createDoctorAndLogin({ email: 'another.doc@example.com' });
    const res = await getDoctorAvailability(anotherDoc.token, doctorUser.id);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('returns 403 FORBIDDEN when an admin accesses the endpoint', async () => {
    const { token } = await createAdminAndLogin();
    const res = await getDoctorAvailability(token, doctorUser.id);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('returns 400 VALIDATION_ERROR for a malformed ObjectId', async () => {
    const res = await getDoctorAvailability(patientToken, 'invalid-id-format');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.message).toMatch(/invalid doctor id/i);
  });

  it('returns 404 NOT_FOUND for a non-existent doctor ID', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await getDoctorAvailability(patientToken, fakeId);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(res.body.message).toMatch(/doctor not found/i);
  });

  it('returns 404 NOT_FOUND when the ID belongs to a patient instead of a doctor', async () => {
    const otherPatient = await createPatientAndLogin({ email: 'not.a.doctor@example.com' });
    const res = await getDoctorAvailability(patientToken, otherPatient.user.id);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('returns 404 NOT_FOUND when the doctor account is inactive', async () => {
    await User.findByIdAndUpdate(doctorUser.id, { isActive: false });

    const res = await getDoctorAvailability(patientToken, doctorUser.id);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('returns doctor open future slots, hiding booked and past slots, and never leaks secrets', async () => {
    const openSlot1 = makeFutureSlot(1, 9, 0);
    const openSlot2 = makeFutureSlot(1, 9, 30);
    const bookedSlot = makeFutureSlot(1, 10, 0);
    const pastStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const pastEnd = new Date(pastStart.getTime() + 30 * 60 * 1000);

    // Seed open slot 1
    await Slot.create({
      doctor: doctorUser.id,
      startTime: new Date(openSlot1.startTime),
      endTime: new Date(openSlot1.endTime),
      isBooked: false,
    });
    // Seed open slot 2
    await Slot.create({
      doctor: doctorUser.id,
      startTime: new Date(openSlot2.startTime),
      endTime: new Date(openSlot2.endTime),
      isBooked: false,
    });
    // Seed booked slot (must NOT appear)
    await Slot.create({
      doctor: doctorUser.id,
      startTime: new Date(bookedSlot.startTime),
      endTime: new Date(bookedSlot.endTime),
      isBooked: true,
    });
    // Seed past slot (must NOT appear)
    await Slot.create({
      doctor: doctorUser.id,
      startTime: pastStart,
      endTime: pastEnd,
      isBooked: false,
    });

    const res = await getDoctorAvailability(patientToken, doctorUser.id);

    expect(res.status).toBe(200);
    expect(res.body.doctor).toBeDefined();
    expect(res.body.doctor.id).toBe(doctorUser.id);
    expect(res.body.doctor.name).toBe('Dr. John Watson');

    // Confidential doctor fields must NEVER be returned
    expect(res.body.doctor.email).toBeUndefined();
    expect(res.body.doctor.phone).toBeUndefined();
    expect(res.body.doctor.passwordHash).toBeUndefined();
    expect(res.body.doctor.__v).toBeUndefined();

    // Exactly 2 open future slots returned
    expect(res.body.slots).toHaveLength(2);
    expect(res.body.slots[0].startTime).toBe(openSlot1.startTime);
    expect(res.body.slots[0].isBooked).toBe(false);
    expect(res.body.slots[1].startTime).toBe(openSlot2.startTime);
    expect(res.body.slots[1].isBooked).toBe(false);

    // Booked and past slots are not in the response
    const startTimes = res.body.slots.map((s) => s.startTime);
    expect(startTimes).not.toContain(bookedSlot.startTime);
    expect(startTimes).not.toContain(pastStart.toISOString());
  });
});
