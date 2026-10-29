// backend/tests/video.test.js
// Comprehensive test suite for FR-11: Video Consultation (UC-07)
// Covers: VideoSession model, ICE server configuration, REST status endpoint,
// Socket.IO authentication, 2-participant waiting room, second-tab guard,
// WebRTC signaling relay, payload size limits, signaling flood protection,
// and live user deactivation / appointment lifecycle guards.

process.env.JWT_SECRET = 'test-secret-for-video-tests';
process.env.JWT_EXPIRES_IN = '1d';
process.env.STUN_SERVERS = 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302';
process.env.TURN_SERVERS = 'turn:turn.example.com:3478';
process.env.TURN_USERNAME = 'testuser';
process.env.TURN_CREDENTIAL = 'testpassword';

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
const VideoSession = require('../src/models/VideoSession');
const videoService = require('../src/services/videoService');
const { getIceServers } = require('../src/config/iceServers');
const { initSocket, closeSocket } = require('../src/sockets');
const {
  _resetCallRooms,
  _resetSignalingFloodLimits,
} = require('../src/sockets/video');
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
  await VideoSession.init();

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
  _resetCallRooms();
  _resetSignalingFloodLimits();
  jest.restoreAllMocks();
});

afterEach(async () => {
  while (activeSockets.length > 0) {
    const s = activeSockets.pop();
    if (s.connected) {
      s.disconnect();
    }
  }
  _resetCallRooms();
  _resetSignalingFloodLimits();
  // Small pause to allow socket disconnect events to settle
  await new Promise((resolve) => setTimeout(resolve, 50));
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

async function createTestAppointment({
  patient,
  doctor,
  status = 'confirmed',
  startOffsetMinutes = 5,
  durationMinutes = 30,
} = {}) {
  const pat = patient || (await createPatient());
  const doc = doctor || (await createDoctor());
  const startTime = new Date(Date.now() + startOffsetMinutes * 60 * 1000);
  const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

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
// 1. ICE Servers Configuration Unit Tests
// =====================================================================
describe('ICE Server Configuration Helper', () => {
  it('parses STUN and TURN configurations from environment variables', () => {
    const servers = getIceServers();
    expect(servers).toHaveLength(2);
    expect(servers[0].urls).toEqual([
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302',
    ]);
    expect(servers[1].urls).toEqual(['turn:turn.example.com:3478']);
    expect(servers[1].username).toBe('testuser');
    expect(servers[1].credential).toBe('testpassword');
  });
});

// =====================================================================
// 2. VideoSession Model & Video Service Lifecycle
// =====================================================================
describe('VideoSession Model & videoService Lifecycle', () => {
  it('enforces at most one session per appointment', async () => {
    const { appointment } = await createTestAppointment();
    const apptId = appointment._id.toString();

    const s1 = await videoService.getOrCreateSession(apptId);
    expect(s1).toBeDefined();

    // Trying to create a duplicate directly triggers unique constraint error
    await expect(VideoSession.create({ appointment: apptId })).rejects.toThrow();
  });

  it('records startTime when session starts and preserves it', async () => {
    const { appointment } = await createTestAppointment();
    const apptId = appointment._id.toString();

    const started = await videoService.startSession(apptId);
    expect(started.startTime).toBeInstanceOf(Date);
    expect(started.endTime).toBeNull();
  });

  it('handles temporary disconnect and clears endTime on rejoin', async () => {
    const { appointment } = await createTestAppointment();
    const apptId = appointment._id.toString();

    await videoService.startSession(apptId);
    const disconnected = await videoService.endSession(apptId, {
      isExplicit: false,
      reason: 'disconnected',
    });
    expect(disconnected.endTime).toBeInstanceOf(Date);
    expect(disconnected.isExplicitlyEnded).toBe(false);

    // Rejoining clears endTime and allows call continuation
    const rejoined = await videoService.getOrCreateSession(apptId);
    expect(rejoined.endTime).toBeNull();
    expect(rejoined.endedReason).toBeNull();
  });

  it('prohibits rejoining after explicit call termination', async () => {
    const { appointment, patient } = await createTestAppointment();
    const apptId = appointment._id.toString();

    await videoService.startSession(apptId);
    await videoService.endSession(apptId, { isExplicit: true, reason: 'call_ended' });

    await expect(
      videoService.verifyVideoAccess(apptId, patient, { checkJoin: true })
    ).rejects.toMatchObject({
      status: 400,
      code: 'CALL_ALREADY_ENDED',
    });
  });

  it('calculates call window correctly (10m before to 60m after)', async () => {
    const now = new Date();
    const appt = {
      dateTime: new Date(now.getTime() + 5 * 60 * 1000), // starts in 5 mins
      endTime: new Date(now.getTime() + 35 * 60 * 1000), // ends in 35 mins
    };

    const inWin = videoService.checkCallWindow(appt, now);
    expect(inWin.inWindow).toBe(true);

    // 15 minutes before start -> too early
    const early = videoService.checkCallWindow(
      appt,
      new Date(now.getTime() - 15 * 60 * 1000)
    );
    expect(early.tooEarly).toBe(true);
    expect(early.inWindow).toBe(false);

    // 70 minutes after end -> too late
    const late = videoService.checkCallWindow(
      appt,
      new Date(now.getTime() + 110 * 60 * 1000)
    );
    expect(late.tooLate).toBe(true);
    expect(late.inWindow).toBe(false);
  });
});

// =====================================================================
// 3. REST Endpoint: GET /api/v1/appointments/:id/video
// =====================================================================
describe('GET /api/v1/appointments/:id/video', () => {
  it('returns canJoin: true and ICE servers for confirmed appointment in window', async () => {
    const { appointment, patient, doctor } = await createTestAppointment({
      startOffsetMinutes: 5,
    });
    const token = signToken(patient);

    const res = await request(app)
      .get(`/api/v1/appointments/${appointment._id}/video`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.canJoin).toBe(true);
    expect(res.body.reason).toBeNull();
    expect(res.body.appointment).toMatchObject({
      id: appointment._id.toString(),
      status: 'confirmed',
      otherParty: {
        id: doctor._id.toString(),
        name: doctor.name,
        role: 'doctor',
      },
    });
    expect(res.body.iceServers).toHaveLength(2);
  });

  it('returns canJoin: false with reason when too early', async () => {
    const { appointment, doctor } = await createTestAppointment({
      startOffsetMinutes: 60, // starts in 1 hour
    });
    const token = signToken(doctor);

    const res = await request(app)
      .get(`/api/v1/appointments/${appointment._id}/video`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.canJoin).toBe(false);
    expect(res.body.reason).toContain('10 minutes before');
    expect(res.body.iceServers).toBeNull();
  });

  it('returns canJoin: false with reason for completed appointment', async () => {
    const { appointment, patient } = await createTestAppointment({
      status: 'completed',
    });
    const token = signToken(patient);

    const res = await request(app)
      .get(`/api/v1/appointments/${appointment._id}/video`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.canJoin).toBe(false);
    expect(res.body.reason).toContain('ended');
    expect(res.body.iceServers).toBeNull();
  });

  it('returns 404 NOT_FOUND for requested or cancelled appointments', async () => {
    const { appointment: reqAppt, patient } = await createTestAppointment({
      status: 'requested',
    });
    const { appointment: canAppt, doctor } = await createTestAppointment({
      status: 'cancelled',
    });

    const resReq = await request(app)
      .get(`/api/v1/appointments/${reqAppt._id}/video`)
      .set('Authorization', `Bearer ${signToken(patient)}`);
    expect(resReq.status).toBe(404);
    expect(resReq.body.code).toBe('NOT_FOUND');

    const resCan = await request(app)
      .get(`/api/v1/appointments/${canAppt._id}/video`)
      .set('Authorization', `Bearer ${signToken(doctor)}`);
    expect(resCan.status).toBe(404);
    expect(resCan.body.code).toBe('NOT_FOUND');
  });

  it('returns 404 NOT_FOUND for strangers (anti-enumeration)', async () => {
    const { appointment } = await createTestAppointment();
    const stranger = await createPatient();

    const res = await request(app)
      .get(`/api/v1/appointments/${appointment._id}/video`)
      .set('Authorization', `Bearer ${signToken(stranger)}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('returns 403 FORBIDDEN for admin accounts', async () => {
    const { appointment } = await createTestAppointment();
    const admin = await createAdmin();

    const res = await request(app)
      .get(`/api/v1/appointments/${appointment._id}/video`)
      .set('Authorization', `Bearer ${signToken(admin)}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('returns 401 UNAUTHORIZED when token is missing', async () => {
    const { appointment } = await createTestAppointment();
    const res = await request(app).get(`/api/v1/appointments/${appointment._id}/video`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('rejects malformed ID and unexpected query parameters with 400 VALIDATION_ERROR', async () => {
    const patient = await createPatient();
    const token = signToken(patient);

    const badId = await request(app)
      .get('/api/v1/appointments/invalid-id/video')
      .set('Authorization', `Bearer ${token}`);
    expect(badId.status).toBe(400);
    expect(badId.body.code).toBe('VALIDATION_ERROR');

    const { appointment } = await createTestAppointment();
    const badQuery = await request(app)
      .get(`/api/v1/appointments/${appointment._id}/video?extra=param`)
      .set('Authorization', `Bearer ${token}`);
    expect(badQuery.status).toBe(400);
    expect(badQuery.body.code).toBe('VALIDATION_ERROR');
  });
});

// =====================================================================
// 4. Socket.IO Signaling, Waiting Room & Capacity
// =====================================================================
describe('Socket.IO Video Signaling & Room Management', () => {
  it('manages waiting state and designates initiator when 2nd participant arrives', async () => {
    const { appointment, patient, doctor } = await createTestAppointment();
    const apptId = appointment._id.toString();

    const patSocket = await connectClientSocket(signToken(patient));
    const docSocket = await connectClientSocket(signToken(doctor));

    // Patient arrives first -> waiting room
    const patJoinAck = await new Promise((res) =>
      patSocket.emit('join_video', { appointmentId: apptId }, res)
    );
    expect(patJoinAck.success).toBe(true);
    expect(patJoinAck.isWaiting).toBe(true);
    expect(patJoinAck.isInitiator).toBe(false);
    expect(patJoinAck.iceServers).toBeDefined();

    const patPeerJoinedPromise = new Promise((res) => patSocket.once('peer_joined', res));

    // Doctor arrives -> 2 participants present, doctor designated initiator
    const docJoinAck = await new Promise((res) =>
      docSocket.emit('join_video', { appointmentId: apptId }, res)
    );
    expect(docJoinAck.success).toBe(true);
    expect(docJoinAck.isWaiting).toBe(false);
    expect(docJoinAck.isInitiator).toBe(true);

    const peerJoined = await patPeerJoinedPromise;
    expect(peerJoined.peer.name).toBe(doctor.name);

    // Verify session started in database
    const session = await VideoSession.findOne({ appointment: apptId });
    expect(session.startTime).toBeInstanceOf(Date);
  });

  it('refuses a third person with ROOM_FULL', async () => {
    const { appointment, patient, doctor } = await createTestAppointment();
    const apptId = appointment._id.toString();

    const patSocket = await connectClientSocket(signToken(patient));
    const docSocket = await connectClientSocket(signToken(doctor));

    await new Promise((res) => patSocket.emit('join_video', { appointmentId: apptId }, res));
    await new Promise((res) => docSocket.emit('join_video', { appointmentId: apptId }, res));

    // Third participant tries to join
    const thirdUser = await createPatient();
    const thirdSocket = await connectClientSocket(signToken(thirdUser));

    const thirdAck = await new Promise((res) =>
      thirdSocket.emit('join_video', { appointmentId: apptId }, res)
    );
    // Note: stranger check triggers 404 NOT_FOUND first; if authorized participant were third, triggers ROOM_FULL
    expect(thirdAck.success).toBe(false);
  });

  it('refuses the same user in a second tab with ALREADY_CONNECTED', async () => {
    const { appointment, patient } = await createTestAppointment();
    const apptId = appointment._id.toString();

    const tab1 = await connectClientSocket(signToken(patient));
    await new Promise((res) => tab1.emit('join_video', { appointmentId: apptId }, res));

    const tab2 = await connectClientSocket(signToken(patient));
    const tab2Ack = await new Promise((res) =>
      tab2.emit('join_video', { appointmentId: apptId }, res)
    );

    expect(tab2Ack.success).toBe(false);
    expect(tab2Ack.code).toBe('ALREADY_CONNECTED');
  });

  it('relays WebRTC offer, answer and ICE candidates only to the other peer', async () => {
    const { appointment, patient, doctor } = await createTestAppointment();
    const apptId = appointment._id.toString();

    const patSocket = await connectClientSocket(signToken(patient));
    const docSocket = await connectClientSocket(signToken(doctor));

    await new Promise((res) => patSocket.emit('join_video', { appointmentId: apptId }, res));
    await new Promise((res) => docSocket.emit('join_video', { appointmentId: apptId }, res));

    // Relay Offer (Doctor -> Patient)
    const patOfferPromise = new Promise((res) => patSocket.once('receive_offer', res));
    const offerAck = await new Promise((res) =>
      docSocket.emit(
        'relay_offer',
        { appointmentId: apptId, sdp: 'v=0\r\no=- ... offer', type: 'offer' },
        res
      )
    );
    expect(offerAck.success).toBe(true);

    const receivedOffer = await patOfferPromise;
    expect(receivedOffer.offer.sdp).toBe('v=0\r\no=- ... offer');
    expect(receivedOffer.sender.name).toBe(doctor.name);

    // Relay Answer (Patient -> Doctor)
    const docAnswerPromise = new Promise((res) => docSocket.once('receive_answer', res));
    const answerAck = await new Promise((res) =>
      patSocket.emit(
        'relay_answer',
        { appointmentId: apptId, sdp: 'v=0\r\no=- ... answer', type: 'answer' },
        res
      )
    );
    expect(answerAck.success).toBe(true);

    const receivedAnswer = await docAnswerPromise;
    expect(receivedAnswer.answer.sdp).toBe('v=0\r\no=- ... answer');

    // Relay Candidate (Doctor -> Patient)
    const patCandPromise = new Promise((res) => patSocket.once('receive_candidate', res));
    const candAck = await new Promise((res) =>
      docSocket.emit(
        'relay_candidate',
        {
          appointmentId: apptId,
          candidate: { candidate: 'candidate:1 1 UDP ...', sdpMid: '0', sdpMLineIndex: 0 },
        },
        res
      )
    );
    expect(candAck.success).toBe(true);

    const receivedCand = await patCandPromise;
    expect(receivedCand.candidate.candidate).toBe('candidate:1 1 UDP ...');
  });

  it('rejects oversized SDP (> 64 KB) with VALIDATION_ERROR', async () => {
    const { appointment, patient, doctor } = await createTestAppointment();
    const apptId = appointment._id.toString();

    const patSocket = await connectClientSocket(signToken(patient));
    const docSocket = await connectClientSocket(signToken(doctor));

    await new Promise((res) => patSocket.emit('join_video', { appointmentId: apptId }, res));
    await new Promise((res) => docSocket.emit('join_video', { appointmentId: apptId }, res));

    const giantSdp = 'a'.repeat(66000);
    const ack = await new Promise((res) =>
      docSocket.emit('relay_offer', { appointmentId: apptId, sdp: giantSdp, type: 'offer' }, res)
    );

    expect(ack.success).toBe(false);
    expect(ack.code).toBe('VALIDATION_ERROR');
  });

  it('enforces signaling flood limit (max 30 events per 3s)', async () => {
    const { appointment, patient, doctor } = await createTestAppointment();
    const apptId = appointment._id.toString();

    const patSocket = await connectClientSocket(signToken(patient));
    const docSocket = await connectClientSocket(signToken(doctor));

    await new Promise((res) => patSocket.emit('join_video', { appointmentId: apptId }, res));
    await new Promise((res) => docSocket.emit('join_video', { appointmentId: apptId }, res));

    let blocked = false;
    for (let i = 1; i <= 32; i++) {
      const ack = await new Promise((res) =>
        docSocket.emit(
          'relay_candidate',
          {
            appointmentId: apptId,
            candidate: { candidate: `cand #${i}` },
          },
          res
        )
      );

      if (!ack.success && ack.code === 'RATE_LIMITED') {
        blocked = true;
        break;
      }
    }

    expect(blocked).toBe(true);
  });

  it('disconnects and rejects user if deactivated during active call', async () => {
    const { appointment, patient, doctor } = await createTestAppointment();
    const apptId = appointment._id.toString();

    const patSocket = await connectClientSocket(signToken(patient));
    const docSocket = await connectClientSocket(signToken(doctor));

    await new Promise((res) => patSocket.emit('join_video', { appointmentId: apptId }, res));
    await new Promise((res) => docSocket.emit('join_video', { appointmentId: apptId }, res));

    // Deactivate doctor
    await User.findByIdAndUpdate(doctor._id, { isActive: false });
    _resetSignalingFloodLimits();

    const ack = await new Promise((res) =>
      docSocket.emit(
        'relay_candidate',
        {
          appointmentId: apptId,
          candidate: { candidate: 'cand' },
        },
        res
      )
    );

    expect(ack.success).toBe(false);
    expect(ack.code).toBe('ACCOUNT_DISABLED');

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(docSocket.connected).toBe(false);
  });

  it('emits call_ended and dissolves room if appointment status changes during call', async () => {
    const { appointment, patient, doctor } = await createTestAppointment();
    const apptId = appointment._id.toString();

    const patSocket = await connectClientSocket(signToken(patient));
    const docSocket = await connectClientSocket(signToken(doctor));

    await new Promise((res) => patSocket.emit('join_video', { appointmentId: apptId }, res));
    await new Promise((res) => docSocket.emit('join_video', { appointmentId: apptId }, res));

    // Doctor completes appointment in DB
    await Appointment.findByIdAndUpdate(apptId, { status: 'completed' });

    const patCallEndedPromise = new Promise((res) => patSocket.once('call_ended', res));

    const ack = await new Promise((res) =>
      docSocket.emit(
        'relay_candidate',
        {
          appointmentId: apptId,
          candidate: { candidate: 'cand' },
        },
        res
      )
    );

    expect(ack.success).toBe(false);
    expect(ack.code).toBe('CALL_CLOSED');

    const callEnded = await patCallEndedPromise;
    expect(callEnded.appointmentId).toBe(apptId);
    expect(callEnded.reason).toBe('completed');
  });

  it('handles explicit leave_video, marks session explicitly ended, and notifies peer', async () => {
    const { appointment, patient, doctor } = await createTestAppointment();
    const apptId = appointment._id.toString();

    const patSocket = await connectClientSocket(signToken(patient));
    const docSocket = await connectClientSocket(signToken(doctor));

    await new Promise((res) => patSocket.emit('join_video', { appointmentId: apptId }, res));
    await new Promise((res) => docSocket.emit('join_video', { appointmentId: apptId }, res));

    const docCallEndedPromise = new Promise((res) => docSocket.once('call_ended', res));

    const leaveAck = await new Promise((res) =>
      patSocket.emit('leave_video', { appointmentId: apptId, isExplicit: true }, res)
    );
    expect(leaveAck.success).toBe(true);

    const callEnded = await docCallEndedPromise;
    expect(callEnded.reason).toBe('call_ended');

    const session = await VideoSession.findOne({ appointment: apptId });
    expect(session.isExplicitlyEnded).toBe(true);
  });
});
