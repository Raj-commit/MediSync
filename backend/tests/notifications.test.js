process.env.JWT_SECRET = 'test-secret-for-notifications-tests';
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
const { Notification } = require('../src/models/Notification');
const notificationService = require('../src/services/notificationService');
const reminderService = require('../src/services/reminderService');
const socketModule = require('../src/sockets');
const { connectTestDB, clearTestDB, closeTestDB } = require('./helpers/db');

jest.setTimeout(25000);

beforeAll(async () => {
  await connectTestDB();
  await User.init();
  await Slot.init();
  await Appointment.init();
  await Notification.init();
});

beforeEach(async () => {
  await clearTestDB();
  jest.restoreAllMocks();
});

afterAll(async () => {
  reminderService.stopReminderJob();
  socketModule.closeSocket();
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

describe('Notifications API & Real-Time Delivery (FR-18, UC-13)', () => {
  describe('GET /api/v1/notifications (List Notifications)', () => {
    it('rejects unauthenticated requests with 401 UNAUTHORIZED', async () => {
      const res = await request(app).get('/api/v1/notifications');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('rejects invalid or malformed token with 401 INVALID_TOKEN', async () => {
      const res = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', 'Bearer invalid-token');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_TOKEN');
    });

    it('rejects admin users with 403 FORBIDDEN', async () => {
      const { token: adminToken } = await createAdminAndLogin();
      const res = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('returns 200 with empty list when user has no notifications', async () => {
      const { token } = await createPatientAndLogin();
      const res = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        notifications: [],
        pagination: {
          total: 0,
          page: 1,
          limit: 10,
          totalPages: 0,
        },
        unreadCount: 0,
      });
    });

    it('returns only the authenticated user notifications (isolation test)', async () => {
      const patient1 = await createPatientAndLogin();
      const patient2 = await createPatientAndLogin();

      await Notification.create({
        recipient: patient1.user.id,
        type: 'appointment_confirmed',
        message: 'Notification for patient 1',
        status: 'unread',
      });

      await Notification.create({
        recipient: patient2.user.id,
        type: 'appointment_confirmed',
        message: 'Notification for patient 2',
        status: 'unread',
      });

      const res1 = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${patient1.token}`);

      expect(res1.status).toBe(200);
      expect(res1.body.notifications).toHaveLength(1);
      expect(res1.body.notifications[0].message).toBe('Notification for patient 1');
      expect(res1.body.unreadCount).toBe(1);

      const res2 = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${patient2.token}`);

      expect(res2.status).toBe(200);
      expect(res2.body.notifications).toHaveLength(1);
      expect(res2.body.notifications[0].message).toBe('Notification for patient 2');
      expect(res2.body.unreadCount).toBe(1);
    });

    it('returns notifications ordered newest first by default', async () => {
      const patient = await createPatientAndLogin();

      const notif1 = await Notification.create({
        recipient: patient.user.id,
        type: 'appointment_confirmed',
        message: 'First notification',
        createdAt: new Date('2026-01-01T10:00:00.000Z'),
      });

      const notif2 = await Notification.create({
        recipient: patient.user.id,
        type: 'appointment_reminder',
        message: 'Second notification',
        createdAt: new Date('2026-01-01T11:00:00.000Z'),
      });

      const res = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${patient.token}`);

      expect(res.status).toBe(200);
      expect(res.body.notifications).toHaveLength(2);
      expect(res.body.notifications[0].id).toBe(notif2._id.toString());
      expect(res.body.notifications[1].id).toBe(notif1._id.toString());
    });

    it('filters notifications by status=unread and status=read', async () => {
      const patient = await createPatientAndLogin();

      await Notification.create({
        recipient: patient.user.id,
        type: 'appointment_confirmed',
        message: 'Unread notification',
        status: 'unread',
      });

      await Notification.create({
        recipient: patient.user.id,
        type: 'appointment_completed',
        message: 'Read notification',
        status: 'read',
      });

      const resUnread = await request(app)
        .get('/api/v1/notifications?status=unread')
        .set('Authorization', `Bearer ${patient.token}`);

      expect(resUnread.status).toBe(200);
      expect(resUnread.body.notifications).toHaveLength(1);
      expect(resUnread.body.notifications[0].status).toBe('unread');
      expect(resUnread.body.unreadCount).toBe(1);

      const resRead = await request(app)
        .get('/api/v1/notifications?status=read')
        .set('Authorization', `Bearer ${patient.token}`);

      expect(resRead.status).toBe(200);
      expect(resRead.body.notifications).toHaveLength(1);
      expect(resRead.body.notifications[0].status).toBe('read');
      // unreadCount should still reflect total unread for badge
      expect(resRead.body.unreadCount).toBe(1);
    });

    it('paginates notifications with page and limit parameters', async () => {
      const patient = await createPatientAndLogin();

      for (let i = 1; i <= 5; i++) {
        await Notification.create({
          recipient: patient.user.id,
          type: 'appointment_confirmed',
          message: `Notification ${i}`,
          status: 'unread',
        });
      }

      const resPage1 = await request(app)
        .get('/api/v1/notifications?page=1&limit=2')
        .set('Authorization', `Bearer ${patient.token}`);

      expect(resPage1.status).toBe(200);
      expect(resPage1.body.notifications).toHaveLength(2);
      expect(resPage1.body.pagination).toEqual({
        page: 1,
        limit: 2,
        total: 5,
        totalPages: 3,
      });

      const resPage3 = await request(app)
        .get('/api/v1/notifications?page=3&limit=2')
        .set('Authorization', `Bearer ${patient.token}`);

      expect(resPage3.status).toBe(200);
      expect(resPage3.body.notifications).toHaveLength(1);
      expect(resPage3.body.pagination.page).toBe(3);
    });

    it('rejects invalid query parameters with 400 VALIDATION_ERROR', async () => {
      const { token } = await createPatientAndLogin();

      const invalidStatus = await request(app)
        .get('/api/v1/notifications?status=deleted')
        .set('Authorization', `Bearer ${token}`);
      expect(invalidStatus.status).toBe(400);
      expect(invalidStatus.body.code).toBe('VALIDATION_ERROR');

      const invalidPage = await request(app)
        .get('/api/v1/notifications?page=0')
        .set('Authorization', `Bearer ${token}`);
      expect(invalidPage.status).toBe(400);
      expect(invalidPage.body.code).toBe('VALIDATION_ERROR');

      const invalidLimit = await request(app)
        .get('/api/v1/notifications?limit=51')
        .set('Authorization', `Bearer ${token}`);
      expect(invalidLimit.status).toBe(400);
      expect(invalidLimit.body.code).toBe('VALIDATION_ERROR');

      const unknownParam = await request(app)
        .get('/api/v1/notifications?filter=all')
        .set('Authorization', `Bearer ${token}`);
      expect(unknownParam.status).toBe(400);
      expect(unknownParam.body.code).toBe('VALIDATION_ERROR');

      const injectionParam = await request(app)
        .get('/api/v1/notifications?page[gt]=1')
        .set('Authorization', `Bearer ${token}`);
      expect(injectionParam.status).toBe(400);
      expect(injectionParam.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PATCH /api/v1/notifications/:id/read (Mark as Read)', () => {
    it('rejects unauthenticated requests with 401 UNAUTHORIZED', async () => {
      const id = new mongoose.Types.ObjectId().toString();
      const res = await request(app).patch(`/api/v1/notifications/${id}/read`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('rejects admin users with 403 FORBIDDEN', async () => {
      const { token: adminToken } = await createAdminAndLogin();
      const id = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .patch(`/api/v1/notifications/${id}/read`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('rejects invalid ObjectId with 400 VALIDATION_ERROR', async () => {
      const { token } = await createPatientAndLogin();
      const res = await request(app)
        .patch('/api/v1/notifications/invalid-id/read')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects request body with 400 VALIDATION_ERROR', async () => {
      const { token } = await createPatientAndLogin();
      const id = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .patch(`/api/v1/notifications/${id}/read`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'read' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 NOT_FOUND for non-existent notification ID', async () => {
      const { token } = await createPatientAndLogin();
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .patch(`/api/v1/notifications/${fakeId}/read`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('returns 404 NOT_FOUND when attempting to mark another user notification (anti-enumeration)', async () => {
      const patient1 = await createPatientAndLogin();
      const patient2 = await createPatientAndLogin();

      const notif = await Notification.create({
        recipient: patient1.user.id,
        type: 'appointment_confirmed',
        message: 'Notification for patient 1',
        status: 'unread',
      });

      // Patient 2 attempts to mark Patient 1's notification
      const res = await request(app)
        .patch(`/api/v1/notifications/${notif._id}/read`)
        .set('Authorization', `Bearer ${patient2.token}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');

      // Verify the notification remains unread
      const updated = await Notification.findById(notif._id);
      expect(updated.status).toBe('unread');
    });

    it('marks own unread notification as read and returns 200', async () => {
      const patient = await createPatientAndLogin();

      const notif = await Notification.create({
        recipient: patient.user.id,
        type: 'appointment_confirmed',
        message: 'Notification to be read',
        status: 'unread',
      });

      const res = await request(app)
        .patch(`/api/v1/notifications/${notif._id}/read`)
        .set('Authorization', `Bearer ${patient.token}`);

      expect(res.status).toBe(200);
      expect(res.body.notification).toBeDefined();
      expect(res.body.notification.id).toBe(notif._id.toString());
      expect(res.body.notification.status).toBe('read');

      const inDb = await Notification.findById(notif._id);
      expect(inDb.status).toBe('read');
    });

    it('is idempotent when marking an already-read notification as read', async () => {
      const patient = await createPatientAndLogin();

      const notif = await Notification.create({
        recipient: patient.user.id,
        type: 'appointment_confirmed',
        message: 'Already read notification',
        status: 'read',
      });

      const res = await request(app)
        .patch(`/api/v1/notifications/${notif._id}/read`)
        .set('Authorization', `Bearer ${patient.token}`);

      expect(res.status).toBe(200);
      expect(res.body.notification.status).toBe('read');
    });
  });

  describe('Appointment Booking Notifications (FR-18, UC-08)', () => {
    it('creates appointment_requested for doctor and appointment_request_sent for patient on booking', async () => {
      const patient = await createPatientAndLogin();
      const doctor = await createDoctorWithSlot(24);

      const appt = await bookAppointment(patient.token, doctor.user.id, doctor.slot._id.toString());

      // Check Doctor's notification
      const doctorNotifs = await Notification.find({ recipient: doctor.user.id });
      expect(doctorNotifs).toHaveLength(1);
      expect(doctorNotifs[0].type).toBe('appointment_requested');
      expect(doctorNotifs[0].status).toBe('unread');
      expect(doctorNotifs[0].appointment.toString()).toBe(appt.id);
      expect(doctorNotifs[0].message).toContain('new appointment request');

      // Check Patient's notification
      const patientNotifs = await Notification.find({ recipient: patient.user.id });
      expect(patientNotifs).toHaveLength(1);
      expect(patientNotifs[0].type).toBe('appointment_request_sent');
      expect(patientNotifs[0].status).toBe('unread');
      expect(patientNotifs[0].appointment.toString()).toBe(appt.id);
      expect(patientNotifs[0].message).toContain('has been sent');
    });
  });

  describe('Appointment Status Transition Notifications (FR-18, UC-09, UC-10)', () => {
    it('notifies patient with appointment_confirmed when doctor accepts', async () => {
      const patient = await createPatientAndLogin();
      const doctor = await createDoctorWithSlot(24);
      const appt = await bookAppointment(patient.token, doctor.user.id, doctor.slot._id.toString());

      const res = await request(app)
        .patch(`/api/v1/appointments/${appt.id}`)
        .set('Authorization', `Bearer ${doctor.token}`)
        .send({ action: 'accept' });

      expect(res.status).toBe(200);

      const patientNotifs = await Notification.find({
        recipient: patient.user.id,
        type: 'appointment_confirmed',
      });
      expect(patientNotifs).toHaveLength(1);
      expect(patientNotifs[0].appointment.toString()).toBe(appt.id);
      expect(patientNotifs[0].message).toContain('confirmed');
    });

    it('notifies patient with appointment_rejected when doctor declines', async () => {
      const patient = await createPatientAndLogin();
      const doctor = await createDoctorWithSlot(24);
      const appt = await bookAppointment(patient.token, doctor.user.id, doctor.slot._id.toString());

      const res = await request(app)
        .patch(`/api/v1/appointments/${appt.id}`)
        .set('Authorization', `Bearer ${doctor.token}`)
        .send({ action: 'reject' });

      expect(res.status).toBe(200);

      const patientNotifs = await Notification.find({
        recipient: patient.user.id,
        type: 'appointment_rejected',
      });
      expect(patientNotifs).toHaveLength(1);
      expect(patientNotifs[0].appointment.toString()).toBe(appt.id);
      expect(patientNotifs[0].message).toContain('declined');
    });

    it('notifies doctor with appointment_cancelled when patient cancels', async () => {
      const patient = await createPatientAndLogin();
      const doctor = await createDoctorWithSlot(24);
      const appt = await bookAppointment(patient.token, doctor.user.id, doctor.slot._id.toString());

      const res = await request(app)
        .patch(`/api/v1/appointments/${appt.id}`)
        .set('Authorization', `Bearer ${patient.token}`)
        .send({ action: 'cancel' });

      expect(res.status).toBe(200);

      const doctorNotifs = await Notification.find({
        recipient: doctor.user.id,
        type: 'appointment_cancelled',
      });
      expect(doctorNotifs).toHaveLength(1);
      expect(doctorNotifs[0].appointment.toString()).toBe(appt.id);
      expect(doctorNotifs[0].message).toContain('cancelled');
    });

    it('notifies doctor with appointment_rescheduled when patient reschedules', async () => {
      const patient = await createPatientAndLogin();
      const doctor = await createDoctorWithSlot(24);
      const appt = await bookAppointment(patient.token, doctor.user.id, doctor.slot._id.toString());

      // Create a second open slot for the doctor
      const slot2Times = makeFutureSlotDates(48);
      const slot2 = await Slot.create({
        doctor: doctor.user.id,
        startTime: slot2Times.startTime,
        endTime: slot2Times.endTime,
        isBooked: false,
      });

      const res = await request(app)
        .patch(`/api/v1/appointments/${appt.id}`)
        .set('Authorization', `Bearer ${patient.token}`)
        .send({ action: 'reschedule', slotId: slot2._id.toString() });

      expect(res.status).toBe(200);

      const doctorNotifs = await Notification.find({
        recipient: doctor.user.id,
        type: 'appointment_rescheduled',
      });
      expect(doctorNotifs).toHaveLength(1);
      expect(doctorNotifs[0].appointment.toString()).toBe(appt.id);
      expect(doctorNotifs[0].message).toContain('rescheduled');
    });

    it('notifies patient with appointment_completed when doctor completes appointment', async () => {
      const patient = await createPatientAndLogin();
      const doctor = await createDoctorWithSlot(24);
      const appt = await bookAppointment(patient.token, doctor.user.id, doctor.slot._id.toString());

      // Accept first
      const acceptRes = await request(app)
        .patch(`/api/v1/appointments/${appt.id}`)
        .set('Authorization', `Bearer ${doctor.token}`)
        .send({ action: 'accept' });
      expect(acceptRes.status).toBe(200);

      // Fast-forward appointment time to past so doctor can complete it
      await Appointment.findByIdAndUpdate(appt.id, { dateTime: new Date(Date.now() - 5000) });

      // Then complete
      const res = await request(app)
        .patch(`/api/v1/appointments/${appt.id}`)
        .set('Authorization', `Bearer ${doctor.token}`)
        .send({ action: 'complete' });

      expect(res.status).toBe(200);

      const patientNotifs = await Notification.find({
        recipient: patient.user.id,
        type: 'appointment_completed',
      });
      expect(patientNotifs).toHaveLength(1);
      expect(patientNotifs[0].appointment.toString()).toBe(appt.id);
      expect(patientNotifs[0].message).toContain('completed');
    });
  });

  describe('Appointment Reminders (FR-18 Background Job)', () => {
    it('sends reminders to patient and doctor for confirmed upcoming appointments in window', async () => {
      const patient = await createPatientAndLogin();
      const doctor = await createDoctorAndLogin();

      // Appointment starting in 30 minutes (within 60m reminder window)
      const apptTime = new Date(Date.now() + 30 * 60 * 1000);
      const slot = await Slot.create({
        doctor: doctor.user.id,
        startTime: apptTime,
        endTime: new Date(apptTime.getTime() + 30 * 60 * 1000),
        isBooked: true,
      });

      const appt = await Appointment.create({
        patient: patient.user.id,
        doctor: doctor.user.id,
        slot: slot._id,
        dateTime: apptTime,
        endTime: slot.endTime,
        status: 'confirmed',
        reminderSent: false,
      });

      await reminderService.checkAndSendReminders();

      // Check reminder sent to patient
      const patientReminder = await Notification.findOne({
        recipient: patient.user.id,
        type: 'appointment_reminder',
      });
      expect(patientReminder).not.toBeNull();
      expect(patientReminder.appointment.toString()).toBe(appt._id.toString());
      expect(patientReminder.message).toContain('upcoming appointment');

      // Check reminder sent to doctor
      const doctorReminder = await Notification.findOne({
        recipient: doctor.user.id,
        type: 'appointment_reminder',
      });
      expect(doctorReminder).not.toBeNull();
      expect(doctorReminder.appointment.toString()).toBe(appt._id.toString());

      // Verify appointment is marked reminderSent: true
      const updatedAppt = await Appointment.findById(appt._id);
      expect(updatedAppt.reminderSent).toBe(true);

      // Running checkAndSendReminders a second time must NOT send duplicates
      await reminderService.checkAndSendReminders();
      const count = await Notification.countDocuments({ type: 'appointment_reminder' });
      expect(count).toBe(2);
    });

    it('ignores appointments that are not confirmed or outside the window', async () => {
      const patient = await createPatientAndLogin();
      const doctor = await createDoctorAndLogin();

      // 1. Requested appointment in window
      const apptTime1 = new Date(Date.now() + 30 * 60 * 1000);
      const slot1 = await Slot.create({
        doctor: doctor.user.id,
        startTime: apptTime1,
        endTime: new Date(apptTime1.getTime() + 30 * 60 * 1000),
        isBooked: true,
      });

      await Appointment.create({
        patient: patient.user.id,
        doctor: doctor.user.id,
        slot: slot1._id,
        dateTime: apptTime1,
        endTime: slot1.endTime,
        status: 'requested',
        reminderSent: false,
      });

      // 2. Confirmed appointment far in future (3 hours away)
      const apptTime2 = new Date(Date.now() + 180 * 60 * 1000);
      const slot2 = await Slot.create({
        doctor: doctor.user.id,
        startTime: apptTime2,
        endTime: new Date(apptTime2.getTime() + 30 * 60 * 1000),
        isBooked: true,
      });

      await Appointment.create({
        patient: patient.user.id,
        doctor: doctor.user.id,
        slot: slot2._id,
        dateTime: apptTime2,
        endTime: slot2.endTime,
        status: 'confirmed',
        reminderSent: false,
      });

      await reminderService.checkAndSendReminders();

      const notifs = await Notification.find({ type: 'appointment_reminder' });
      expect(notifs).toHaveLength(0);
    });

    it('starts and stops reminder job without throwing errors', () => {
      const timer = reminderService.startReminderJob(10000);
      expect(timer).toBeDefined();
      expect(() => reminderService.stopReminderJob()).not.toThrow();
    });
  });

  describe('Non-Blocking Resilience & Privacy (AGENTS.md sections 7, 8, 9)', () => {
    it('does not fail booking if notification creation throws an unexpected error', async () => {
      const patient = await createPatientAndLogin();
      const doctor = await createDoctorWithSlot(24);

      // Force createNotification to throw
      jest.spyOn(notificationService, 'createNotification').mockImplementation(() => {
        throw new Error('Database connection issue in notification service');
      });

      const res = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${patient.token}`)
        .send({ doctorId: doctor.user.id, slotId: doctor.slot._id.toString() });

      expect(res.status).toBe(201);
      expect(res.body.appointment).toBeDefined();
      expect(res.body.appointment.status).toBe('requested');
    });

    it('ensures notification messages contain no passwords, emails, or phone numbers', async () => {
      const patient = await createPatientAndLogin({
        email: 'secret_patient@example.com',
        phone: '+919876543210',
      });
      const doctor = await createDoctorWithSlot(24, false, {
        email: 'secret_doctor@example.com',
        phone: '+919876543211',
      });

      await bookAppointment(patient.token, doctor.user.id, doctor.slot._id.toString());

      const notifs = await Notification.find();
      for (const n of notifs) {
        expect(n.message).not.toContain(PASSWORD);
        expect(n.message).not.toContain('secret_patient@example.com');
        expect(n.message).not.toContain('secret_doctor@example.com');
        expect(n.message).not.toContain('+919876543210');
        expect(n.message).not.toContain('+919876543211');
      }
    });

    it('emits live socket event when notification is created', async () => {
      const patient = await createPatientAndLogin();
      const socketSpy = jest.spyOn(socketModule, 'sendNotificationToUser');

      await notificationService.createNotification({
        recipient: patient.user.id,
        type: 'appointment_confirmed',
        message: 'Live notification test',
      });

      expect(socketSpy).toHaveBeenCalledTimes(1);
      expect(socketSpy).toHaveBeenCalledWith(
        patient.user.id,
        expect.objectContaining({
          type: 'appointment_confirmed',
          message: 'Live notification test',
        })
      );
    });
  });
});
