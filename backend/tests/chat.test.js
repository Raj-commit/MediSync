// backend/tests/chat.test.js
// Comprehensive test suite for FR-12: Consultation Chat (UC-08)
// Covers: ChatMessage model, atomic gapless chatSeq, REST history endpoint,
// Socket.IO authentication, room joining, message broadcasts, flooding protection,
// and live user deactivation / appointment lifecycle guards.

process.env.JWT_SECRET = 'test-secret-for-chat-tests';
process.env.JWT_EXPIRES_IN = '1d';

// Disable login rate limiter in tests
jest.mock('../src/middleware/rateLimiters', () => ({
  createLoginLimiter: () => (req, res, next) => next(),
}));

const http = require('http');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const ioClient = require('socket.io-client');

const app = require('../src/app');
const { User, Patient, Doctor, Admin } = require('../src/models/User');
const Slot = require('../src/models/Slot');
const Appointment = require('../src/models/Appointment');
const ChatMessage = require('../src/models/ChatMessage');
const chatService = require('../src/services/chatService');
const { initSocket, closeSocket } = require('../src/sockets');
const { _resetFloodLimits } = require('../src/sockets/chat');
const { signToken } = require('../src/utils/token');
const { connectTestDB, clearTestDB, closeTestDB } = require('./helpers/db');

jest.setTimeout(30000);

let httpServer;
let serverUrl;
const activeSockets = [];

beforeAll(async () => {
  await connectTestDB();
  await User.init();
  await Slot.init();
  await Appointment.init();
  await ChatMessage.init();

  httpServer = http.createServer(app);
  initSocket(httpServer);

  await new Promise((resolve) => {
    httpServer.listen(0, '127.0.0.1', () => {
      const port = httpServer.address().port;
      serverUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

beforeEach(async () => {
  await clearTestDB();
  _resetFloodLimits();
  jest.restoreAllMocks();
});

afterEach(() => {
  while (activeSockets.length > 0) {
    const s = activeSockets.pop();
    if (s.connected) {
      s.disconnect();
    }
  }
  _resetFloodLimits();
});

afterAll(async () => {
  closeSocket();
  if (httpServer) {
    await new Promise((resolve) => httpServer.close(resolve));
  }
  await closeTestDB();
});

// ---------- Test Helpers ----------

const PASSWORD = 'password123';
let userSeq = 0;

async function createPatient(overrides = {}) {
  userSeq += 1;
  const hash = await bcrypt.hash(PASSWORD, 4);
  return Patient.create({
    role: 'patient',
    name: `Patient ${userSeq}`,
    email: `patient_${userSeq}_${Date.now()}@example.com`,
    phone: `+9112345${String(userSeq).padStart(5, '0')}`,
    passwordHash: hash,
    dateOfBirth: new Date('1995-05-15'),
    address: '123 Test Street',
    isActive: true,
    ...overrides,
  });
}

async function createDoctor(overrides = {}) {
  userSeq += 1;
  const hash = await bcrypt.hash(PASSWORD, 4);
  return Doctor.create({
    role: 'doctor',
    name: `Dr. Doctor ${userSeq}`,
    email: `doctor_${userSeq}_${Date.now()}@example.com`,
    phone: `+9198765${String(userSeq).padStart(5, '0')}`,
    passwordHash: hash,
    specialisations: ['General Medicine'],
    qualification: 'MBBS, MD',
    isActive: true,
    ...overrides,
  });
}

async function createAdmin(overrides = {}) {
  userSeq += 1;
  const hash = await bcrypt.hash(PASSWORD, 4);
  return Admin.create({
    name: `Admin ${userSeq}`,
    email: `admin_${userSeq}_${Date.now()}@example.com`,
    phone: `+9111111${String(userSeq).padStart(5, '0')}`,
    passwordHash: hash,
    isActive: true,
    ...overrides,
  });
}

async function createTestAppointment({ patient, doctor, status = 'confirmed', chatSeq = 0 } = {}) {
  const pat = patient || (await createPatient());
  const doc = doctor || (await createDoctor());
  const startTime = new Date(Date.now() + 3600 * 1000);
  const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);

  const slot = await Slot.create({
    doctor: doc._id,
    startTime,
    endTime,
    isBooked: true,
  });

  const appt = await Appointment.create({
    patient: pat._id,
    doctor: doc._id,
    slot: slot._id,
    dateTime: startTime,
    endTime,
    status,
    chatSeq,
  });

  return { appointment: appt, patient: pat, doctor: doc, slot };
}

function connectClientSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = ioClient(serverUrl, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
      timeout: 4000,
    });

    socket.on('connect', () => {
      activeSockets.push(socket);
      resolve(socket);
    });

    socket.on('connect_error', (err) => {
      activeSockets.push(socket);
      reject(err);
    });
  });
}

// =====================================================================
// 1. Model & Service Unit / Concurrency Tests
// =====================================================================
describe('ChatMessage Model & Chat Service', () => {
  it('assigns gapless sequential numbers under concurrent sends', async () => {
    const { appointment, patient } = await createTestAppointment();
    const apptId = appointment._id.toString();

    const sends = Array.from({ length: 10 }, (_, i) =>
      chatService.createMessage({
        appointmentId: apptId,
        user: patient,
        content: `Concurrent message ${i + 1}`,
      })
    );

    const results = await Promise.all(sends);
    const seqs = results.map((r) => r.seq).sort((a, b) => a - b);

    // Must be exactly 1 through 10 with no gaps or duplicates
    expect(seqs).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    const updatedAppt = await Appointment.findById(apptId);
    expect(updatedAppt.chatSeq).toBe(10);
  });

  it('rejects non-string or empty content with 400 VALIDATION_ERROR', async () => {
    const { appointment, patient } = await createTestAppointment();
    const apptId = appointment._id.toString();

    await expect(
      chatService.createMessage({
        appointmentId: apptId,
        user: patient,
        content: '   ',
      })
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });

    await expect(
      chatService.createMessage({
        appointmentId: apptId,
        user: patient,
        content: null,
      })
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });

    await expect(
      chatService.createMessage({
        appointmentId: apptId,
        user: patient,
        content: { text: 'hello' },
      })
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  it('rejects content exceeding 1,000 characters', async () => {
    const { appointment, patient } = await createTestAppointment();
    const apptId = appointment._id.toString();

    const tooLong = 'a'.repeat(1001);
    await expect(
      chatService.createMessage({
        appointmentId: apptId,
        user: patient,
        content: tooLong,
      })
    ).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: expect.stringContaining('1000'),
    });
  });

  it('trims leading and trailing whitespace on messages', async () => {
    const { appointment, patient } = await createTestAppointment();
    const apptId = appointment._id.toString();

    const msg = await chatService.createMessage({
      appointmentId: apptId,
      user: patient,
      content: '  Trimmed message content  ',
    });

    expect(msg.content).toBe('Trimmed message content');
  });

  it('prohibits sending to completed appointments (read-only)', async () => {
    const { appointment, patient } = await createTestAppointment({ status: 'completed' });
    const apptId = appointment._id.toString();

    await expect(
      chatService.createMessage({
        appointmentId: apptId,
        user: patient,
        content: 'Follow-up question',
      })
    ).rejects.toMatchObject({
      status: 400,
      code: 'CHAT_CLOSED',
    });
  });

  it('prohibits sending to requested or cancelled appointments with 404 NOT_FOUND', async () => {
    const { appointment: reqAppt, patient } = await createTestAppointment({ status: 'requested' });
    await expect(
      chatService.createMessage({
        appointmentId: reqAppt._id.toString(),
        user: patient,
        content: 'Hello',
      })
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });

    const { appointment: cancelAppt, doctor } = await createTestAppointment({
      status: 'cancelled',
    });
    await expect(
      chatService.createMessage({
        appointmentId: cancelAppt._id.toString(),
        user: doctor,
        content: 'Hello',
      })
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });
});

// =====================================================================
// 2. REST Endpoint: GET /api/v1/appointments/:id/messages
// =====================================================================
describe('GET /api/v1/appointments/:id/messages', () => {
  it('allows patient of confirmed appointment to view history', async () => {
    const { appointment, patient } = await createTestAppointment();
    const token = signToken(patient);

    await chatService.createMessage({
      appointmentId: appointment._id.toString(),
      user: patient,
      content: 'Hello from patient',
    });

    const res = await request(app)
      .get(`/api/v1/appointments/${appointment._id}/messages`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(1);
    expect(res.body.messages[0]).toMatchObject({
      seq: 1,
      content: 'Hello from patient',
      sender: { id: patient._id.toString(), name: patient.name },
    });
    expect(res.body.hasMore).toBe(false);
  });

  it('allows doctor of confirmed appointment to view history', async () => {
    const { appointment, doctor } = await createTestAppointment();
    const token = signToken(doctor);

    const res = await request(app)
      .get(`/api/v1/appointments/${appointment._id}/messages`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.messages).toEqual([]);
    expect(res.body.hasMore).toBe(false);
  });

  it('allows reading history of a completed appointment (read-only record)', async () => {
    const { appointment, patient } = await createTestAppointment({ status: 'completed' });
    const token = signToken(patient);

    const res = await request(app)
      .get(`/api/v1/appointments/${appointment._id}/messages`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.messages).toEqual([]);
  });

  it('returns 404 NOT_FOUND for requested or cancelled appointments', async () => {
    const { appointment: reqAppt, patient } = await createTestAppointment({ status: 'requested' });
    const patToken = signToken(patient);

    const resReq = await request(app)
      .get(`/api/v1/appointments/${reqAppt._id}/messages`)
      .set('Authorization', `Bearer ${patToken}`);
    expect(resReq.status).toBe(404);
    expect(resReq.body.code).toBe('NOT_FOUND');

    const { appointment: canAppt, doctor } = await createTestAppointment({ status: 'cancelled' });
    const docToken = signToken(doctor);

    const resCan = await request(app)
      .get(`/api/v1/appointments/${canAppt._id}/messages`)
      .set('Authorization', `Bearer ${docToken}`);
    expect(resCan.status).toBe(404);
    expect(resCan.body.code).toBe('NOT_FOUND');
  });

  it('returns 404 NOT_FOUND for strangers (anti-enumeration)', async () => {
    const { appointment } = await createTestAppointment();
    const strangerPatient = await createPatient();
    const strangerDoctor = await createDoctor();

    const patRes = await request(app)
      .get(`/api/v1/appointments/${appointment._id}/messages`)
      .set('Authorization', `Bearer ${signToken(strangerPatient)}`);
    expect(patRes.status).toBe(404);
    expect(patRes.body.code).toBe('NOT_FOUND');

    const docRes = await request(app)
      .get(`/api/v1/appointments/${appointment._id}/messages`)
      .set('Authorization', `Bearer ${signToken(strangerDoctor)}`);
    expect(docRes.status).toBe(404);
    expect(docRes.body.code).toBe('NOT_FOUND');
  });

  it('returns 403 FORBIDDEN for admin accounts', async () => {
    const { appointment } = await createTestAppointment();
    const admin = await createAdmin();

    const res = await request(app)
      .get(`/api/v1/appointments/${appointment._id}/messages`)
      .set('Authorization', `Bearer ${signToken(admin)}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('returns 401 UNAUTHORIZED when token is missing', async () => {
    const { appointment } = await createTestAppointment();
    const res = await request(app).get(`/api/v1/appointments/${appointment._id}/messages`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('validates appointment ID format (400 VALIDATION_ERROR on malformed id)', async () => {
    const patient = await createPatient();
    const res = await request(app)
      .get('/api/v1/appointments/not-an-objectid/messages')
      .set('Authorization', `Bearer ${signToken(patient)}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects unexpected query parameters with 400 VALIDATION_ERROR', async () => {
    const { appointment, patient } = await createTestAppointment();
    const res = await request(app)
      .get(`/api/v1/appointments/${appointment._id}/messages?unknown=param`)
      .set('Authorization', `Bearer ${signToken(patient)}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('supports cursor pagination via limit and beforeSeq', async () => {
    const { appointment, patient, doctor } = await createTestAppointment();
    const apptId = appointment._id.toString();

    // Create 5 messages
    for (let i = 1; i <= 5; i++) {
      await chatService.createMessage({
        appointmentId: apptId,
        user: i % 2 === 1 ? patient : doctor,
        content: `Message ${i}`,
      });
    }

    const token = signToken(patient);

    // Page 1: limit=2
    const page1 = await request(app)
      .get(`/api/v1/appointments/${apptId}/messages?limit=2`)
      .set('Authorization', `Bearer ${token}`);
    expect(page1.status).toBe(200);
    expect(page1.body.messages).toHaveLength(2);
    expect(page1.body.messages[0].seq).toBe(1);
    expect(page1.body.messages[1].seq).toBe(2);
    expect(page1.body.hasMore).toBe(true);

    // Older messages before seq 4 with limit=2 (should fetch seq 2 and 3)
    const pageBefore = await request(app)
      .get(`/api/v1/appointments/${apptId}/messages?beforeSeq=4&limit=2`)
      .set('Authorization', `Bearer ${token}`);
    expect(pageBefore.status).toBe(200);
    expect(pageBefore.body.messages).toHaveLength(2);
    expect(pageBefore.body.messages[0].seq).toBe(2);
    expect(pageBefore.body.messages[1].seq).toBe(3);
    expect(pageBefore.body.hasMore).toBe(true);

    // Messages after seq 3 (should fetch seq 4 and 5)
    const pageAfter = await request(app)
      .get(`/api/v1/appointments/${apptId}/messages?afterSeq=3&limit=10`)
      .set('Authorization', `Bearer ${token}`);
    expect(pageAfter.status).toBe(200);
    expect(pageAfter.body.messages).toHaveLength(2);
    expect(pageAfter.body.messages[0].seq).toBe(4);
    expect(pageAfter.body.messages[1].seq).toBe(5);
    expect(pageAfter.body.hasMore).toBe(false);
  });
});

// =====================================================================
// 3. Socket.IO Connection & Authentication Tests
// =====================================================================
describe('Socket.IO Connection & Handshake Authentication', () => {
  it('rejects connection if no token is provided', async () => {
    await expect(connectClientSocket(null)).rejects.toThrow();
  });

  it('rejects connection with an invalid token', async () => {
    await expect(connectClientSocket('invalid.jwt.token')).rejects.toThrow();
  });

  it('rejects connection if user is inactive / disabled', async () => {
    const inactivePatient = await createPatient({ isActive: false });
    const token = signToken(inactivePatient);
    await expect(connectClientSocket(token)).rejects.toThrow();
  });

  it('successfully connects authenticated active patient and doctor', async () => {
    const patient = await createPatient();
    const socket = await connectClientSocket(signToken(patient));
    expect(socket.connected).toBe(true);
  });
});

// =====================================================================
// 4. Socket.IO Chat Events: join_chat & send_message
// =====================================================================
describe('Socket.IO Chat Events', () => {
  it('allows participants to join appointment room and exchange messages', async () => {
    const { appointment, patient, doctor } = await createTestAppointment();
    const apptId = appointment._id.toString();

    const patSocket = await connectClientSocket(signToken(patient));
    const docSocket = await connectClientSocket(signToken(doctor));

    // Join room
    const patJoinAck = await new Promise((res) =>
      patSocket.emit('join_chat', { appointmentId: apptId }, res)
    );
    expect(patJoinAck).toEqual({ success: true, appointmentId: apptId });

    const docJoinAck = await new Promise((res) =>
      docSocket.emit('join_chat', { appointmentId: apptId }, res)
    );
    expect(docJoinAck).toEqual({ success: true, appointmentId: apptId });

    // Doctor listens for new message
    const docReceivedPromise = new Promise((res) => docSocket.once('new_message', res));

    // Patient sends message
    const sendAck = await new Promise((res) =>
      patSocket.emit(
        'send_message',
        { appointmentId: apptId, content: 'Hello Dr. Doctor' },
        res
      )
    );

    expect(sendAck.success).toBe(true);
    expect(sendAck.message).toMatchObject({
      seq: 1,
      appointment: apptId,
      sender: { id: patient._id.toString(), name: patient.name },
      content: 'Hello Dr. Doctor',
    });

    const receivedBroadcast = await docReceivedPromise;
    expect(receivedBroadcast.appointmentId).toBe(apptId);
    expect(receivedBroadcast.message.seq).toBe(1);
    expect(receivedBroadcast.message.content).toBe('Hello Dr. Doctor');
    expect(receivedBroadcast.message.sender.name).toBe(patient.name);
  });

  it('does not broadcast messages to clients outside the room', async () => {
    const { appointment: apptA, patient: patA } = await createTestAppointment();
    const { appointment: apptB, patient: patB } = await createTestAppointment();

    const socketA = await connectClientSocket(signToken(patA));
    const socketB = await connectClientSocket(signToken(patB));

    await new Promise((res) =>
      socketA.emit('join_chat', { appointmentId: apptA._id.toString() }, res)
    );
    await new Promise((res) =>
      socketB.emit('join_chat', { appointmentId: apptB._id.toString() }, res)
    );

    let socketBReceived = false;
    socketB.on('new_message', () => {
      socketBReceived = true;
    });

    await new Promise((res) =>
      socketA.emit(
        'send_message',
        { appointmentId: apptA._id.toString(), content: 'Private message in Room A' },
        res
      )
    );

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(socketBReceived).toBe(false);
  });

  it('rejects stranger joining chat with 404 NOT_FOUND (anti-enumeration)', async () => {
    const { appointment } = await createTestAppointment();
    const stranger = await createPatient();
    const socket = await connectClientSocket(signToken(stranger));

    const joinAck = await new Promise((res) =>
      socket.emit('join_chat', { appointmentId: appointment._id.toString() }, res)
    );

    expect(joinAck.success).toBe(false);
    expect(joinAck.code).toBe('NOT_FOUND');
  });

  it('rejects admin joining chat with 403 FORBIDDEN', async () => {
    const { appointment } = await createTestAppointment();
    const admin = await createAdmin();
    const socket = await connectClientSocket(signToken(admin));

    const joinAck = await new Promise((res) =>
      socket.emit('join_chat', { appointmentId: appointment._id.toString() }, res)
    );

    expect(joinAck.success).toBe(false);
    expect(joinAck.code).toBe('FORBIDDEN');
  });

  it('enforces flooding protection (max 5 messages per 3s)', async () => {
    const { appointment, patient } = await createTestAppointment();
    const apptId = appointment._id.toString();
    const socket = await connectClientSocket(signToken(patient));

    await new Promise((res) => socket.emit('join_chat', { appointmentId: apptId }, res));

    const acks = [];
    for (let i = 1; i <= 6; i++) {
      const ack = await new Promise((res) =>
        socket.emit('send_message', { appointmentId: apptId, content: `Message #${i}` }, res)
      );
      acks.push(ack);
    }

    // First 5 should succeed
    for (let i = 0; i < 5; i++) {
      expect(acks[i].success).toBe(true);
    }

    // 6th message should be rate limited
    expect(acks[5].success).toBe(false);
    expect(acks[5].code).toBe('RATE_LIMITED');
  });

  it('disconnects and rejects user if deactivated while connected', async () => {
    const { appointment, patient } = await createTestAppointment();
    const apptId = appointment._id.toString();
    const socket = await connectClientSocket(signToken(patient));

    await new Promise((res) => socket.emit('join_chat', { appointmentId: apptId }, res));

    // Deactivate user in database (e.g. admin disabled account)
    await User.findByIdAndUpdate(patient._id, { isActive: false });

    const sendAck = await new Promise((res) =>
      socket.emit(
        'send_message',
        { appointmentId: apptId, content: 'Attempting to send while disabled' },
        res
      )
    );

    expect(sendAck.success).toBe(false);
    expect(sendAck.code).toBe('ACCOUNT_DISABLED');

    // Give socket disconnect event a moment to propagate
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(socket.connected).toBe(false);
  });

  it('rejects sending when appointment is completed while connected', async () => {
    const { appointment, doctor } = await createTestAppointment();
    const apptId = appointment._id.toString();
    const socket = await connectClientSocket(signToken(doctor));

    await new Promise((res) => socket.emit('join_chat', { appointmentId: apptId }, res));

    // Mark appointment completed
    await Appointment.findByIdAndUpdate(apptId, { status: 'completed' });

    const sendAck = await new Promise((res) =>
      socket.emit(
        'send_message',
        { appointmentId: apptId, content: 'Sending to completed consultation' },
        res
      )
    );

    expect(sendAck.success).toBe(false);
    expect(sendAck.code).toBe('CHAT_CLOSED');
  });
});
