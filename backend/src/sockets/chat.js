const { User } = require('../models/User');
const chatService = require('../services/chatService');
const { validateAppointmentId } = require('../utils/validateChat');
const AppError = require('../utils/AppError');

const FLOOD_LIMIT = 5;
const FLOOD_WINDOW_MS = 3000;
const userMessageHistory = new Map(); // userId -> number[]

/**
 * Checks in-memory message rate limit per user.
 * Allows at most FLOOD_LIMIT messages within FLOOD_WINDOW_MS.
 *
 * @param {string} userId
 * @returns {boolean} True if allowed, false if rate limited
 */
function checkFloodLimit(userId) {
  const now = Date.now();
  const history = userMessageHistory.get(userId) || [];
  const recent = history.filter((time) => now - time < FLOOD_WINDOW_MS);

  if (recent.length >= FLOOD_LIMIT) {
    userMessageHistory.set(userId, recent);
    return false;
  }

  recent.push(now);
  userMessageHistory.set(userId, recent);

  // Periodic pruning if map grows large to prevent unbounded memory usage
  if (userMessageHistory.size > 1000) {
    for (const [id, timestamps] of userMessageHistory.entries()) {
      const active = timestamps.filter((t) => now - t < FLOOD_WINDOW_MS);
      if (active.length === 0) {
        userMessageHistory.delete(id);
      } else {
        userMessageHistory.set(id, active);
      }
    }
  }

  return true;
}

/**
 * Resets flood limit tracking (useful for automated testing).
 */
function _resetFloodLimits() {
  userMessageHistory.clear();
}

/**
 * Re-verifies that the user still exists and remains active in the database.
 * Disconnects socket if the account has been disabled.
 *
 * @param {import('socket.io').Socket} socket
 * @returns {Promise<object>} Fresh user document
 */
async function verifyActiveUser(socket) {
  const userId = socket.user?._id || socket.user?.id;
  if (!userId) {
    throw new AppError(401, 'UNAUTHORIZED', 'Please log in to continue');
  }

  const user = await User.findById(userId);
  if (!user || !user.isActive) {
    throw new AppError(403, 'ACCOUNT_DISABLED', 'This account has been disabled');
  }

  socket.user = user;
  return user;
}

/**
 * Safely executes a socket acknowledgement callback if provided.
 */
function acknowledge(callback, response) {
  if (typeof callback === 'function') {
    try {
      callback(response);
    } catch (err) {
      console.error('Socket callback execution failed:', err);
    }
  }
}

/**
 * Registers consultation chat socket event handlers on an authenticated connection.
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
function registerChatHandlers(io, socket) {
  // Event: join_chat
  // Client requests to join the private room for a specific appointment.
  socket.on('join_chat', async (payload, callback) => {
    try {
      // 1. Verify user is still active in the database
      const activeUser = await verifyActiveUser(socket);

      const data =
        payload !== null && typeof payload === 'object' && !Array.isArray(payload)
          ? payload
          : typeof payload === 'string'
            ? { appointmentId: payload }
            : {};

      const appointmentId = validateAppointmentId(data.appointmentId);

      // 2. Verify that activeUser is a participant and appointment status permits chat
      await chatService.verifyChatAccess(appointmentId, activeUser, { checkSend: false });

      const roomName = `appointment:${appointmentId}`;
      socket.join(roomName);

      acknowledge(callback, {
        success: true,
        appointmentId,
      });
    } catch (err) {
      const status = err.status || 500;
      const code = err.code || (status === 500 ? 'INTERNAL_ERROR' : 'ERROR');
      const message = status === 500 ? 'Failed to join chat' : err.message;

      acknowledge(callback, {
        success: false,
        code,
        message,
      });

      if (code === 'ACCOUNT_DISABLED') {
        socket.disconnect(true);
      }
    }
  });

  // Event: send_message
  // Client sends a consultation chat message.
  socket.on('send_message', async (payload, callback) => {
    try {
      const userId = (socket.user?._id || socket.user?.id)?.toString();

      // 1. Flooding protection check (in-memory rate limiting: max 5 messages per 3s)
      if (!userId || !checkFloodLimit(userId)) {
        throw new AppError(429, 'RATE_LIMITED', 'Too many messages. Please slow down.');
      }

      // 2. Re-verify user is still active in the database (admin might have disabled them)
      const activeUser = await verifyActiveUser(socket);

      const data =
        payload !== null && typeof payload === 'object' && !Array.isArray(payload)
          ? payload
          : {};

      const appointmentId = validateAppointmentId(data.appointmentId);

      // 3. Persist the message with atomic sequence assignment and status verification
      const savedMessage = await chatService.createMessage({
        appointmentId,
        user: activeUser,
        content: data.content,
      });

      const roomName = `appointment:${appointmentId}`;

      // 4. Broadcast the new message to everyone in the appointment's room (including sender)
      io.to(roomName).emit('new_message', {
        appointmentId,
        message: savedMessage,
      });

      acknowledge(callback, {
        success: true,
        message: savedMessage,
      });
    } catch (err) {
      const status = err.status || 500;
      const code = err.code || (status === 500 ? 'INTERNAL_ERROR' : 'ERROR');
      const message = status === 500 ? 'Failed to send message' : err.message;

      acknowledge(callback, {
        success: false,
        code,
        message,
      });

      if (code === 'ACCOUNT_DISABLED') {
        socket.disconnect(true);
      }
    }
  });
}

module.exports = {
  FLOOD_LIMIT,
  FLOOD_WINDOW_MS,
  checkFloodLimit,
  _resetFloodLimits,
  registerChatHandlers,
};
