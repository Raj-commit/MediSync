const mongoose = require('mongoose');
const Appointment = require('../models/Appointment');
const ChatMessage = require('../models/ChatMessage');
const AppError = require('../utils/AppError');

const MAX_MESSAGE_LENGTH = 1000;

/**
 * Verifies that the user has permission to access chat for the appointment.
 * Returns 403 for admins, and 404 for non-participants, non-existent appointments,
 * or appointments with status 'requested' / 'cancelled' (anti-enumeration).
 *
 * @param {string} appointmentId
 * @param {object} user - The authenticated User document or session
 * @param {object} options
 * @param {boolean} options.checkSend - True if verifying permission to send messages
 * @returns {Promise<{ appointment: object, isPatient: boolean, isDoctor: boolean }>}
 */
async function verifyChatAccess(appointmentId, user, { checkSend = false } = {}) {
  if (user.role === 'admin') {
    throw new AppError(403, 'FORBIDDEN', 'Admins cannot access consultation chat');
  }

  if (!appointmentId || !mongoose.isObjectIdOrHexString(appointmentId)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid appointment ID');
  }

  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) {
    throw new AppError(404, 'NOT_FOUND', 'Appointment not found');
  }

  const userIdStr = (user._id || user.id).toString();
  const isPatient = appointment.patient.toString() === userIdStr;
  const isDoctor = appointment.doctor.toString() === userIdStr;

  if (!isPatient && !isDoctor) {
    // Return 404 to prevent appointment ID probing
    throw new AppError(404, 'NOT_FOUND', 'Appointment not found');
  }

  // Appointment lifecycle status checks:
  // Chat is prohibited for requested and cancelled appointments (404 NOT_FOUND).
  if (appointment.status === 'requested' || appointment.status === 'cancelled') {
    throw new AppError(404, 'NOT_FOUND', 'Appointment not found');
  }

  if (checkSend) {
    if (appointment.status === 'completed') {
      throw new AppError(
        400,
        'CHAT_CLOSED',
        'This consultation has ended and the conversation is now read-only'
      );
    }
    if (appointment.status !== 'confirmed') {
      throw new AppError(
        400,
        'APPOINTMENT_NOT_ACTIVE',
        'Messages can only be sent for confirmed appointments'
      );
    }
  } else {
    // Reading is permitted for confirmed and completed
    if (appointment.status !== 'confirmed' && appointment.status !== 'completed') {
      throw new AppError(404, 'NOT_FOUND', 'Appointment not found');
    }
  }

  return { appointment, isPatient, isDoctor };
}

/**
 * Creates and persists a new ChatMessage with an atomic, gapless sequence number.
 *
 * @param {object} params
 * @param {string} params.appointmentId
 * @param {object} params.user
 * @param {string} params.content
 * @returns {Promise<object>} Sanitized message object
 */
async function createMessage({ appointmentId, user, content }) {
  await verifyChatAccess(appointmentId, user, { checkSend: true });

  if (typeof content !== 'string' || content.trim() === '') {
    throw new AppError(400, 'VALIDATION_ERROR', 'Message content is required');
  }

  const trimmed = content.trim();
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `Message content must be at most ${MAX_MESSAGE_LENGTH} characters`
    );
  }

  // Atomically increment the sequence counter on the confirmed appointment.
  // This guarantees ordered, gapless sequence numbers without race conditions.
  const updatedAppt = await Appointment.findOneAndUpdate(
    { _id: appointmentId, status: 'confirmed' },
    { $inc: { chatSeq: 1 } },
    { returnDocument: 'after' }
  );

  if (!updatedAppt) {
    throw new AppError(
      400,
      'APPOINTMENT_NOT_ACTIVE',
      'Messages can only be sent for confirmed appointments'
    );
  }

  const seq = updatedAppt.chatSeq;

  const message = await ChatMessage.create({
    appointment: appointmentId,
    seq,
    sender: user._id || user.id,
    content: trimmed,
    timestamp: new Date(),
  });

  return {
    id: message._id.toString(),
    appointment: appointmentId.toString(),
    seq: message.seq,
    sender: {
      id: (user._id || user.id).toString(),
      name: user.name,
    },
    content: message.content,
    timestamp: message.timestamp.toISOString(),
  };
}

/**
 * Retrieves paginated chat messages for an appointment in chronological order (oldest first).
 *
 * @param {object} params
 * @param {string} params.appointmentId
 * @param {object} params.user
 * @param {number} [params.limit=50]
 * @param {number} [params.beforeSeq]
 * @param {number} [params.afterSeq]
 * @returns {Promise<{ messages: Array, hasMore: boolean }>}
 */
async function listMessages({ appointmentId, user, limit = 50, beforeSeq, afterSeq }) {
  await verifyChatAccess(appointmentId, user, { checkSend: false });

  const query = { appointment: appointmentId };

  if (beforeSeq !== undefined && afterSeq !== undefined) {
    query.seq = { $lt: beforeSeq, $gt: afterSeq };
  } else if (beforeSeq !== undefined) {
    query.seq = { $lt: beforeSeq };
  } else if (afterSeq !== undefined) {
    query.seq = { $gt: afterSeq };
  }

  let messages;
  let hasMore = false;

  if (beforeSeq !== undefined) {
    // When requesting messages before a specific seq, sort descending to fetch
    // the closest preceding messages, then reverse back to chronological order.
    const raw = await ChatMessage.find(query)
      .sort({ seq: -1 })
      .limit(limit + 1)
      .populate('sender', 'name');

    hasMore = raw.length > limit;
    const sliced = raw.slice(0, limit);
    messages = sliced.reverse();
  } else {
    // Standard forward query sorted ascending
    const raw = await ChatMessage.find(query)
      .sort({ seq: 1 })
      .limit(limit + 1)
      .populate('sender', 'name');

    hasMore = raw.length > limit;
    messages = raw.slice(0, limit);
  }

  const formatted = messages.map((msg) => ({
    id: msg._id.toString(),
    appointment: msg.appointment.toString(),
    seq: msg.seq,
    sender: {
      id: msg.sender?._id ? msg.sender._id.toString() : (msg.sender ? msg.sender.toString() : 'unknown'),
      name: msg.sender?.name || 'User',
    },
    content: msg.content,
    timestamp: msg.timestamp.toISOString(),
  }));

  return {
    messages: formatted,
    hasMore,
  };
}

module.exports = {
  MAX_MESSAGE_LENGTH,
  verifyChatAccess,
  createMessage,
  listMessages,
};
