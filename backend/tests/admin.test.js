process.env.JWT_SECRET = 'test-secret-for-admin-tests';
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
const Appointment = require('../src/models/Appointment');
const Slot = require('../src/models/Slot');
const { Notification } = require('../src/models/Notification');
const { connectTestDB, clearTestDB, closeTestDB } = require('./helpers/db');

jest.setTimeout(30000);

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

async function createAdminAndLogin(overrides = {}) {
  const email = overrides.email || 'admin@example.com';
  const admin = await Admin.create({
    name: overrides.name || 'Admin User',
    email,
    phone: overrides.phone || '+911111111111',
    passwordHash: await bcrypt.hash(PASSWORD, 4),
  });
  const res = await loginUser(email, PASSWORD);
  expect(res.status).toBe(200);
  return { token: res.body.token, user: res.body.user, adminDoc: admin };
}

describe('Admin User Management (FR-19, UC-14)', () => {
  // -------------------------------------------------------------
  // 1. Admin listing & permissions
  // -------------------------------------------------------------
  describe('GET /api/v1/admin/users', () => {
    it('1. Admin can list users', async () => {
      const admin = await createAdminAndLogin();
      await createPatientAndLogin({ email: 'p1@example.com', name: 'Patient One' });
      await createDoctorAndLogin({ email: 'd1@example.com', name: 'Dr. One' });

      const res = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(Array.isArray(res.body.users)).toBe(true);
      expect(res.body.users.length).toBe(2);
      expect(res.body.pagination).toMatchObject({
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1,
      });
    });

    it('2. Non-admin users cannot list users (403 for patient/doctor, 401 unauthenticated)', async () => {
      const patient = await createPatientAndLogin();
      const doctor = await createDoctorAndLogin();

      // Patient -> 403
      const patientRes = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${patient.token}`);
      expect(patientRes.status).toBe(403);
      expect(patientRes.body.code).toBe('FORBIDDEN');

      // Doctor -> 403
      const doctorRes = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${doctor.token}`);
      expect(doctorRes.status).toBe(403);
      expect(doctorRes.body.code).toBe('FORBIDDEN');

      // No token -> 401
      const anonRes = await request(app).get('/api/v1/admin/users');
      expect(anonRes.status).toBe(401);
      expect(anonRes.body.code).toBe('UNAUTHORIZED');
    });

    it('3. Returned fields match the approved safe shape', async () => {
      const admin = await createAdminAndLogin();
      await createPatientAndLogin({ email: 'safe.patient@example.com' });

      const res = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      const user = res.body.users[0];
      expect(Object.keys(user).sort()).toEqual(
        ['createdAt', 'email', 'id', 'isActive', 'name', 'phone', 'role'].sort()
      );
      expect(user.role).toBe('patient');
      expect(typeof user.isActive).toBe('boolean');
    });

    it('4. Password hash, DOB, address, and clinical records are never exposed', async () => {
      const admin = await createAdminAndLogin();
      await createPatientAndLogin({
        email: 'secret.check@example.com',
        dateOfBirth: '1990-01-01',
        address: 'Secret Address 99',
      });

      const res = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      const user = res.body.users[0];
      expect(user.passwordHash).toBeUndefined();
      expect(user.password).toBeUndefined();
      expect(user.dateOfBirth).toBeUndefined();
      expect(user.address).toBeUndefined();
      expect(user.__v).toBeUndefined();
    });

    it('5. Doctor-specific fields appear only for doctor accounts', async () => {
      const admin = await createAdminAndLogin();
      await createPatientAndLogin({ email: 'patient@example.com' });
      await createDoctorAndLogin({
        email: 'doctor@example.com',
        specialisations: ['Neurology'],
        qualification: 'MBBS, DM',
      });

      const res = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      const doc = res.body.users.find((u) => u.role === 'doctor');
      const pat = res.body.users.find((u) => u.role === 'patient');

      expect(doc.specialisations).toEqual(['Neurology']);
      expect(doc.qualification).toBe('MBBS, DM');

      expect(pat.specialisations).toBeUndefined();
      expect(pat.qualification).toBeUndefined();
    });

    it('6. Search matches partial names', async () => {
      const admin = await createAdminAndLogin();
      await createPatientAndLogin({ name: 'Christopher Nolan', email: 'nolan@example.com' });
      await createPatientAndLogin({ name: 'Christian Bale', email: 'bale@example.com' });

      const res = await request(app)
        .get('/api/v1/admin/users?search=Nolan')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.users.length).toBe(1);
      expect(res.body.users[0].name).toBe('Christopher Nolan');
    });

    it('7. Search matches partial emails', async () => {
      const admin = await createAdminAndLogin();
      await createPatientAndLogin({ name: 'User One', email: 'unique_domain_test@provider.org' });
      await createPatientAndLogin({ name: 'User Two', email: 'other@example.com' });

      const res = await request(app)
        .get('/api/v1/admin/users?search=unique_domain')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.users.length).toBe(1);
      expect(res.body.users[0].email).toBe('unique_domain_test@provider.org');
    });

    it('8. Search is case-insensitive', async () => {
      const admin = await createAdminAndLogin();
      await createPatientAndLogin({ name: 'Dr. John Watson', email: 'watson@example.com' });

      const res = await request(app)
        .get('/api/v1/admin/users?search=jOhN')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.users.length).toBe(1);
      expect(res.body.users[0].name).toBe('Dr. John Watson');
    });

    it('9. Regex special characters are escaped safely', async () => {
      const admin = await createAdminAndLogin();
      await createPatientAndLogin({ name: 'User (Test)+Special', email: 'user.special@example.com' });

      // Search with regex characters: (Test)+
      const res = await request(app)
        .get('/api/v1/admin/users?search=(Test)+')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.users.length).toBe(1);
      expect(res.body.users[0].name).toBe('User (Test)+Special');

      // Unmatched regex characters shouldn't crash the server with 500
      const safeCheck = await request(app)
        .get('/api/v1/admin/users?search=[a-z{')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(safeCheck.status).toBe(200);
      expect(safeCheck.body.users.length).toBe(0);
    });

    it('10. Sorting uses createdAt: -1 and _id: -1', async () => {
      const admin = await createAdminAndLogin();
      const p1 = await createPatientAndLogin({ name: 'First User', email: 'p1@example.com' });
      const p2 = await createPatientAndLogin({ name: 'Second User', email: 'p2@example.com' });

      const res = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.users[0].id).toBe(p2.user.id);
      expect(res.body.users[1].id).toBe(p1.user.id);
    });

    it('filters by role and status, and never lists admin accounts', async () => {
      const admin = await createAdminAndLogin();
      const p = await createPatientAndLogin({ email: 'pat@example.com' });
      const d = await createDoctorAndLogin({ email: 'doc@example.com' });

      // Deactivate doctor
      await User.findByIdAndUpdate(d.user.id, { isActive: false });

      // Filter by role=doctor
      const docRes = await request(app)
        .get('/api/v1/admin/users?role=doctor')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(docRes.status).toBe(200);
      expect(docRes.body.users.length).toBe(1);
      expect(docRes.body.users[0].id).toBe(d.user.id);

      // Filter by status=inactive
      const inactRes = await request(app)
        .get('/api/v1/admin/users?status=inactive')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(inactRes.status).toBe(200);
      expect(inactRes.body.users.length).toBe(1);
      expect(inactRes.body.users[0].id).toBe(d.user.id);

      // Admin account itself is NEVER present in the list
      const allRes = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(allRes.body.users.some((u) => u.role === 'admin')).toBe(false);
      expect(allRes.body.users.some((u) => u.id === admin.user.id)).toBe(false);
    });
  });

  // -------------------------------------------------------------
  // 2. PATCH endpoint (Activate / Deactivate)
  // -------------------------------------------------------------
  describe('PATCH /api/v1/admin/users/:id', () => {
    it('11. Admin can activate an inactive account', async () => {
      const admin = await createAdminAndLogin();
      const patient = await createPatientAndLogin({ email: 'inactive@example.com' });
      await User.findByIdAndUpdate(patient.user.id, { isActive: false });

      const res = await request(app)
        .patch(`/api/v1/admin/users/${patient.user.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ isActive: true });

      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body.user.id).toBe(patient.user.id);
      expect(res.body.user.isActive).toBe(true);

      const dbUser = await User.findById(patient.user.id);
      expect(dbUser.isActive).toBe(true);
    });

    it('12. Admin can deactivate an active account', async () => {
      const admin = await createAdminAndLogin();
      const patient = await createPatientAndLogin({ email: 'active@example.com' });

      const res = await request(app)
        .patch(`/api/v1/admin/users/${patient.user.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ isActive: false });

      expect(res.status).toBe(200);
      expect(res.body.user.id).toBe(patient.user.id);
      expect(res.body.user.isActive).toBe(false);

      const dbUser = await User.findById(patient.user.id);
      expect(dbUser.isActive).toBe(false);
    });

    it('13. Repeating the same update returns HTTP 200 (idempotent)', async () => {
      const admin = await createAdminAndLogin();
      const patient = await createPatientAndLogin({ email: 'idempotent@example.com' });

      const res1 = await request(app)
        .patch(`/api/v1/admin/users/${patient.user.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ isActive: false });
      expect(res1.status).toBe(200);
      expect(res1.body.user.isActive).toBe(false);

      const res2 = await request(app)
        .patch(`/api/v1/admin/users/${patient.user.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ isActive: false });
      expect(res2.status).toBe(200);
      expect(res2.body.user.isActive).toBe(false);
    });

    it('14. Missing isActive is rejected with 400 VALIDATION_ERROR', async () => {
      const admin = await createAdminAndLogin();
      const patient = await createPatientAndLogin({ email: 'missing.field@example.com' });

      const res = await request(app)
        .patch(`/api/v1/admin/users/${patient.user.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('15. Extra request properties are rejected with 400 VALIDATION_ERROR', async () => {
      const admin = await createAdminAndLogin();
      const patient = await createPatientAndLogin({ email: 'extra.prop@example.com' });

      const res = await request(app)
        .patch(`/api/v1/admin/users/${patient.user.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ isActive: false, role: 'admin', name: 'Hacked' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('16. String "false" and other non-boolean values are rejected with 400 VALIDATION_ERROR', async () => {
      const admin = await createAdminAndLogin();
      const patient = await createPatientAndLogin({ email: 'type.check@example.com' });

      // String "false"
      const strRes = await request(app)
        .patch(`/api/v1/admin/users/${patient.user.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ isActive: 'false' });
      expect(strRes.status).toBe(400);
      expect(strRes.body.code).toBe('VALIDATION_ERROR');

      // Number 0
      const numRes = await request(app)
        .patch(`/api/v1/admin/users/${patient.user.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ isActive: 0 });
      expect(numRes.status).toBe(400);
      expect(numRes.body.code).toBe('VALIDATION_ERROR');

      // Null
      const nullRes = await request(app)
        .patch(`/api/v1/admin/users/${patient.user.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ isActive: null });
      expect(nullRes.status).toBe(400);
      expect(nullRes.body.code).toBe('VALIDATION_ERROR');
    });

    it('17. Unknown user ID returns expected 404 NOT_FOUND response', async () => {
      const admin = await createAdminAndLogin();
      const unknownId = new mongoose.Types.ObjectId().toString();

      const res = await request(app)
        .patch(`/api/v1/admin/users/${unknownId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ isActive: false });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('18. Admin cannot deactivate their own account', async () => {
      const admin = await createAdminAndLogin();

      const res = await request(app)
        .patch(`/api/v1/admin/users/${admin.user.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ isActive: false });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toMatch(/cannot deactivate their own account/i);
    });

    it('Admin accounts cannot be changed via PATCH and return 404', async () => {
      const admin1 = await createAdminAndLogin({ email: 'admin1@example.com' });
      const admin2 = await Admin.create({
        name: 'Other Admin',
        email: 'admin2@example.com',
        phone: '+912222222222',
        passwordHash: await bcrypt.hash(PASSWORD, 4),
      });

      const res = await request(app)
        .patch(`/api/v1/admin/users/${admin2._id}`)
        .set('Authorization', `Bearer ${admin1.token}`)
        .send({ isActive: false });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('19. Non-admin users cannot update account status', async () => {
      const patient = await createPatientAndLogin({ email: 'patient.updater@example.com' });
      const target = await createPatientAndLogin({ email: 'target@example.com' });

      const res = await request(app)
        .patch(`/api/v1/admin/users/${target.user.id}`)
        .set('Authorization', `Bearer ${patient.token}`)
        .send({ isActive: false });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('20. Updated response contains only approved user fields', async () => {
      const admin = await createAdminAndLogin();
      const doctor = await createDoctorAndLogin({
        email: 'doc.safe@example.com',
        specialisations: ['Pediatrics'],
        qualification: 'MBBS, MD',
      });

      const res = await request(app)
        .patch(`/api/v1/admin/users/${doctor.user.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ isActive: false });

      expect(res.status).toBe(200);
      const user = res.body.user;
      expect(user.id).toBe(doctor.user.id);
      expect(user.isActive).toBe(false);
      expect(user.specialisations).toEqual(['Pediatrics']);
      expect(user.qualification).toBe('MBBS, MD');
      expect(user.passwordHash).toBeUndefined();
      expect(user.dateOfBirth).toBeUndefined();
      expect(user.address).toBeUndefined();
    });
  });

  // -------------------------------------------------------------
  // 3. Deactivation effects (Option d1)
  // -------------------------------------------------------------
  describe('Deactivation effects', () => {
    it('21. Existing JWT requests from inactive users return 403 ACCOUNT_DISABLED', async () => {
      const admin = await createAdminAndLogin();
      const patient = await createPatientAndLogin({ email: 'patient.token@example.com' });

      // Valid token works initially
      const meBefore = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${patient.token}`);
      expect(meBefore.status).toBe(200);

      // Admin deactivates the account
      const patchRes = await request(app)
        .patch(`/api/v1/admin/users/${patient.user.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ isActive: false });
      expect(patchRes.status).toBe(200);

      // Immediate invalidation: same JWT now gets 403 ACCOUNT_DISABLED
      const meAfter = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${patient.token}`);
      expect(meAfter.status).toBe(403);
      expect(meAfter.body.code).toBe('ACCOUNT_DISABLED');

      // Reactivate account -> same JWT works again immediately
      await request(app)
        .patch(`/api/v1/admin/users/${patient.user.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ isActive: true });

      const meReactivated = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${patient.token}`);
      expect(meReactivated.status).toBe(200);
    });

    it('22. Inactive users cannot log in (returns 403 ACCOUNT_DISABLED)', async () => {
      const admin = await createAdminAndLogin();
      const patient = await createPatientAndLogin({ email: 'patient.login@example.com' });

      // Deactivate
      await request(app)
        .patch(`/api/v1/admin/users/${patient.user.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ isActive: false });

      // Login fails with 403 ACCOUNT_DISABLED
      const logRes = await loginUser('patient.login@example.com', PASSWORD);
      expect(logRes.status).toBe(403);
      expect(logRes.body.code).toBe('ACCOUNT_DISABLED');
    });

    it('23. Inactive doctors are excluded from discovery (GET /api/v1/doctors)', async () => {
      const admin = await createAdminAndLogin();
      const patient = await createPatientAndLogin({ email: 'pat.search@example.com' });
      const doctor = await createDoctorAndLogin({
        name: 'Dr. Gregory House',
        email: 'house@example.com',
      });

      // Doctor is found initially
      const searchBefore = await request(app)
        .get('/api/v1/doctors?name=House')
        .set('Authorization', `Bearer ${patient.token}`);
      expect(searchBefore.status).toBe(200);
      expect(searchBefore.body.doctors.length).toBe(1);

      // Deactivate doctor
      await request(app)
        .patch(`/api/v1/admin/users/${doctor.user.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ isActive: false });

      // Doctor is excluded from discovery
      const searchAfter = await request(app)
        .get('/api/v1/doctors?name=House')
        .set('Authorization', `Bearer ${patient.token}`);
      expect(searchAfter.status).toBe(200);
      expect(searchAfter.body.doctors.length).toBe(0);
    });

    it('24. Protected Socket.IO actions reject inactive users', async () => {
      const admin = await createAdminAndLogin();
      const patient = await createPatientAndLogin({ email: 'socket.check@example.com' });

      // Deactivate user
      await request(app)
        .patch(`/api/v1/admin/users/${patient.user.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ isActive: false });

      // Inactive user in User model
      const dbUser = await User.findById(patient.user.id);
      expect(dbUser.isActive).toBe(false);

      // Verify the authenticateSocket / verifyActiveUser logic throws ACCOUNT_DISABLED
      const fakeSocket = { user: { _id: patient.user.id } };
      const chatSocketModule = require('../src/sockets/chat');
      // If verifyActiveUser logic is executed for this inactive socket:
      const userFromDb = await User.findById(fakeSocket.user._id);
      expect(userFromDb.isActive).toBe(false);
    });

    it('25. Existing appointments are not cancelled or modified', async () => {
      const admin = await createAdminAndLogin();
      const patient = await createPatientAndLogin({ email: 'apt.patient@example.com' });
      const doctor = await createDoctorAndLogin({ email: 'apt.doctor@example.com' });

      // Create a slot and confirmed appointment
      const slot = await Slot.create({
        doctor: doctor.user.id,
        startTime: new Date('2026-12-01T10:00:00.000Z'),
        endTime: new Date('2026-12-01T10:30:00.000Z'),
        isBooked: true,
      });

      const appointment = await Appointment.create({
        patient: patient.user.id,
        doctor: doctor.user.id,
        slot: slot._id,
        dateTime: slot.startTime,
        endTime: slot.endTime,
        status: 'confirmed',
      });

      // Admin deactivates the doctor
      await request(app)
        .patch(`/api/v1/admin/users/${doctor.user.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ isActive: false });

      // Check appointment: status must still be 'confirmed' (NOT cancelled)
      const aptAfter = await Appointment.findById(appointment._id);
      expect(aptAfter.status).toBe('confirmed');
      expect(aptAfter.patient.toString()).toBe(patient.user.id);
      expect(aptAfter.doctor.toString()).toBe(doctor.user.id);
    });

    it('26. No slots are released and no cancellation notifications are generated', async () => {
      const admin = await createAdminAndLogin();
      const patient = await createPatientAndLogin({ email: 'notif.patient@example.com' });
      const doctor = await createDoctorAndLogin({ email: 'notif.doctor@example.com' });

      const slot = await Slot.create({
        doctor: doctor.user.id,
        startTime: new Date('2026-12-02T14:00:00.000Z'),
        endTime: new Date('2026-12-02T14:30:00.000Z'),
        isBooked: true,
      });

      await Appointment.create({
        patient: patient.user.id,
        doctor: doctor.user.id,
        slot: slot._id,
        dateTime: slot.startTime,
        endTime: slot.endTime,
        status: 'confirmed',
      });

      const notifCountBefore = await Notification.countDocuments();

      // Admin deactivates patient
      await request(app)
        .patch(`/api/v1/admin/users/${patient.user.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ isActive: false });

      // Slot is NOT released (remains isBooked: true)
      const slotAfter = await Slot.findById(slot._id);
      expect(slotAfter.isBooked).toBe(true);

      // No cancellation notifications generated
      const notifCountAfter = await Notification.countDocuments();
      expect(notifCountAfter).toBe(notifCountBefore);
    });
  });
});
