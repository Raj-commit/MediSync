const mongoose = require('mongoose');
const Appointment = require('../models/Appointment');
const VideoSession = require('../models/VideoSession');
const AppError = require('../utils/AppError');

const CALL_WINDOW_BEFORE_MINUTES = 10;
const CALL_WINDOW_AFTER_MINUTES = 60;

/**
 * Checks whether the current time falls within the allowed call window.
 * Window: 10 minutes before appointment dateTime to 60 minutes after endTime.
 *
 * @param {object} appointment
 * @param {Date} [now=new Date()]
 * @returns {{ inWindow: boolean, tooEarly: boolean, tooLate: boolean, windowStart: Date, windowEnd: Date }}
 */
function checkCallWindow(appointment, now = new Date()) {
  const windowStart = new Date(
    appointment.dateTime.getTime() - CALL_WINDOW_BEFORE_MINUTES * 60 * 1000
  );
  const windowEnd = new Date(
    appointment.endTime.getTime() + CALL_WINDOW_AFTER_MINUTES * 60 * 1000
  );

  const tooEarly = now < windowStart;
  const tooLate = now > windowEnd;
  const inWindow = !tooEarly && !tooLate;

  return { inWindow, tooEarly, tooLate, windowStart, windowEnd };
}

/**
 * Verifies that the user has permission to access video consultation for the appointment.
 * Checks, in order: valid JWT (handled upstream), role, ownership, status rule, time window.
 * Returns 403 for admins, and 404 for non-participants, non-existent appointments,
 * or appointments with status 'requested' / 'cancelled' (anti-enumeration).
 *
 * @param {string} appointmentId
 * @param {object} user - The authenticated User document or session
 * @param {object} [options={}]
 * @param {boolean} [options.checkJoin=false] - True if verifying permission to join the live call
 * @param {Date} [options.now=new Date()]
 * @returns {Promise<{ appointment: object, isPatient: boolean, isDoctor: boolean, session: object|null }>}
 */
async function verifyVideoAccess(
  appointmentId,
  user,
  { checkJoin = false, now = new Date() } = {}
) {
  if (user.role === 'admin') {
    throw new AppError(403, 'FORBIDDEN', 'Admins cannot access video consultations');
  }

  if (!appointmentId || !mongoose.isObjectIdOrHexString(appointmentId)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid appointment ID');
  }

  const appointment = await Appointment.findById(appointmentId)
    .populate('patient', 'name')
    .populate('doctor', 'name');

  if (!appointment) {
    throw new AppError(404, 'NOT_FOUND', 'Appointment not found');
  }

  const userIdStr = (user._id || user.id).toString();
  const patientIdStr = appointment.patient._id
    ? appointment.patient._id.toString()
    : appointment.patient.toString();
  const doctorIdStr = appointment.doctor._id
    ? appointment.doctor._id.toString()
    : appointment.doctor.toString();

  const isPatient = patientIdStr === userIdStr;
  const isDoctor = doctorIdStr === userIdStr;

  if (!isPatient && !isDoctor) {
    // Return 404 to prevent appointment ID probing
    throw new AppError(404, 'NOT_FOUND', 'Appointment not found');
  }

  // Lifecycle status checks:
  // Video consultation is prohibited for requested and cancelled appointments (404 NOT_FOUND).
  if (appointment.status === 'requested' || appointment.status === 'cancelled') {
    throw new AppError(404, 'NOT_FOUND', 'Appointment not found');
  }

  const session = await VideoSession.findOne({ appointment: appointmentId });

  if (checkJoin) {
    if (appointment.status === 'completed') {
      throw new AppError(
        400,
        'CALL_CLOSED',
        'This consultation has ended and cannot be rejoined'
      );
    }

    if (appointment.status !== 'confirmed') {
      throw new AppError(
        400,
        'APPOINTMENT_NOT_ACTIVE',
        'Video calls can only be joined for confirmed appointments'
      );
    }

    if (session?.isExplicitlyEnded) {
      throw new AppError(
        400,
        'CALL_ALREADY_ENDED',
        'This video consultation was ended and cannot be rejoined'
      );
    }

    const { tooEarly, tooLate } = checkCallWindow(appointment, now);
    if (tooEarly) {
      throw new AppError(
        400,
        'CALL_NOT_STARTED',
        'Video consultation can be joined starting 10 minutes before the appointment time'
      );
    }

    if (tooLate) {
      throw new AppError(
        400,
        'CALL_EXPIRED',
        'The time window for this video consultation has passed'
      );
    }
  }

  return { appointment, isPatient, isDoctor, session };
}

/**
 * Calculates current call eligibility and status details for the REST endpoint.
 *
 * @param {string} appointmentId
 * @param {object} user
 * @param {Date} [now=new Date()]
 * @returns {Promise<object>}
 */
async function getVideoCallStatus(appointmentId, user, now = new Date()) {
  const { appointment, isPatient, session } = await verifyVideoAccess(
    appointmentId,
    user,
    { checkJoin: false, now }
  );

  let canJoin = false;
  let reason = null;

  if (appointment.status === 'completed') {
    canJoin = false;
    reason = 'This consultation has ended and cannot be rejoined';
  } else if (appointment.status !== 'confirmed') {
    canJoin = false;
    reason = 'Video calls can only be joined for confirmed appointments';
  } else if (session?.isExplicitlyEnded) {
    canJoin = false;
    reason = 'This video consultation was ended and cannot be rejoined';
  } else {
    const { tooEarly, tooLate } = checkCallWindow(appointment, now);
    if (tooEarly) {
      canJoin = false;
      reason = 'Video consultation can be joined starting 10 minutes before the appointment time';
    } else if (tooLate) {
      canJoin = false;
      reason = 'The time window for this video consultation has passed';
    } else {
      canJoin = true;
      reason = null;
    }
  }

  const otherUserDoc = isPatient ? appointment.doctor : appointment.patient;
  const otherParty = {
    id: (otherUserDoc._id || otherUserDoc).toString(),
    name: otherUserDoc.name || 'User',
    role: isPatient ? 'doctor' : 'patient',
  };

  return {
    canJoin,
    reason,
    appointment: {
      id: appointment._id.toString(),
      status: appointment.status,
      dateTime: appointment.dateTime.toISOString(),
      endTime: appointment.endTime.toISOString(),
      otherParty,
    },
    session: session
      ? {
          startTime: session.startTime ? session.startTime.toISOString() : null,
          endTime: session.endTime ? session.endTime.toISOString() : null,
          isExplicitlyEnded: Boolean(session.isExplicitlyEnded),
        }
      : null,
  };
}

/**
 * Atomically retrieves or initializes the VideoSession document for an appointment.
 * Clears temporary disconnect endTime if rejoining.
 *
 * @param {string} appointmentId
 * @returns {Promise<object>} VideoSession document
 */
async function getOrCreateSession(appointmentId) {
  let session = await VideoSession.findOne({ appointment: appointmentId });

  if (!session) {
    session = await VideoSession.findOneAndUpdate(
      { appointment: appointmentId },
      { $setOnInsert: { appointment: appointmentId } },
      { upsert: true, returnDocument: 'after' }
    );
  } else if (
    session.endTime &&
    !session.isExplicitlyEnded &&
    session.endedReason === 'disconnected'
  ) {
    // Rejoining after temporary disconnect / browser refresh
    session.endTime = null;
    session.endedReason = null;
    await session.save();
  }

  return session;
}

/**
 * Starts the VideoSession when the second participant joins (both peers present).
 *
 * @param {string} appointmentId
 * @returns {Promise<object>} VideoSession document
 */
async function startSession(appointmentId) {
  let session = await VideoSession.findOne({ appointment: appointmentId });

  if (!session) {
    session = await VideoSession.create({
      appointment: appointmentId,
      startTime: new Date(),
    });
  } else if (!session.startTime) {
    session.startTime = new Date();
    session.endTime = null;
    session.endedReason = null;
    await session.save();
  } else if (
    session.endTime &&
    !session.isExplicitlyEnded &&
    session.endedReason === 'disconnected'
  ) {
    session.endTime = null;
    session.endedReason = null;
    await session.save();
  }

  return session;
}

/**
 * Ends the VideoSession when participants leave or call is explicitly terminated.
 *
 * @param {string} appointmentId
 * @param {object} [options={}]
 * @param {boolean} [options.isExplicit=false] - True if user clicked end call
 * @param {string} [options.reason='disconnected'] - Termination reason
 * @returns {Promise<object|null>} VideoSession document
 */
async function endSession(
  appointmentId,
  { isExplicit = false, reason = 'disconnected' } = {}
) {
  const update = {
    $set: {
      endTime: new Date(),
      endedReason: isExplicit ? 'call_ended' : reason,
      isExplicitlyEnded: isExplicit,
    },
  };

  const session = await VideoSession.findOneAndUpdate(
    { appointment: appointmentId },
    update,
    { returnDocument: 'after' }
  );

  return session;
}

module.exports = {
  CALL_WINDOW_BEFORE_MINUTES,
  CALL_WINDOW_AFTER_MINUTES,
  checkCallWindow,
  verifyVideoAccess,
  getVideoCallStatus,
  getOrCreateSession,
  startSession,
  endSession,
};
