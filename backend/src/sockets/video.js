const { User } = require('../models/User');
const Appointment = require('../models/Appointment');
const videoService = require('../services/videoService');
const { getIceServers } = require('../config/iceServers');
const { validateAppointmentId } = require('../utils/validateVideo');
const AppError = require('../utils/AppError');

// In-memory mapping of active video consultation rooms:
// appointmentId -> Map<socketId, { userId: string, role: string, name: string, socket: Socket }>
const activeCallRooms = new Map();

/**
 * Resets active call rooms (useful for test isolation).
 */
function _resetCallRooms() {
  activeCallRooms.clear();
}

/**
 * Returns the active call rooms map (for testing).
 */
function _getActiveCallRooms() {
  return activeCallRooms;
}

/**
 * Re-verifies that the user still exists and remains active in the database.
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
 * Extracts and sanitizes standard payload objects.
 */
function parsePayload(payload) {
  if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
    return payload;
  }
  if (typeof payload === 'string') {
    return { appointmentId: payload };
  }
  return {};
}

/**
 * Terminates an active call room if appointment status is completed or cancelled.
 */
async function checkAppointmentStatus(appointmentId, io) {
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment || appointment.status === 'completed' || appointment.status === 'cancelled') {
    const status = appointment ? appointment.status : 'cancelled';
    await videoService.endSession(appointmentId, { isExplicit: true, reason: status });

    const roomName = `video:${appointmentId}`;
    io.to(roomName).emit('call_ended', {
      appointmentId,
      reason: status,
      message: 'The consultation has ended',
    });

    const roomParticipants = activeCallRooms.get(appointmentId);
    if (roomParticipants) {
      for (const p of roomParticipants.values()) {
        p.socket.leave(roomName);
      }
      activeCallRooms.delete(appointmentId);
    }

    throw new AppError(
      400,
      status === 'completed' ? 'CALL_CLOSED' : 'NOT_FOUND',
      status === 'completed' ? 'This consultation has ended' : 'Appointment not found'
    );
  }
  return appointment;
}

/**
 * Registers WebRTC video consultation signaling handlers on an authenticated connection.
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
function registerVideoHandlers(io, socket) {
  // Event: join_video
  // Client requests to join the 2-person video consultation room.
  socket.on('join_video', async (payload, callback) => {
    try {
      // 1. Verify user is active in DB
      const activeUser = await verifyActiveUser(socket);
      const data = parsePayload(payload);
      const appointmentId = validateAppointmentId(data.appointmentId);

      // 2. Verify appointment ownership, status, and time window
      await videoService.verifyVideoAccess(appointmentId, activeUser, { checkJoin: true });

      const roomName = `video:${appointmentId}`;
      let roomParticipants = activeCallRooms.get(appointmentId);
      if (!roomParticipants) {
        roomParticipants = new Map();
        activeCallRooms.set(appointmentId, roomParticipants);
      }

      const userIdStr = activeUser._id.toString();

      // Check second-tab conflict
      for (const existing of roomParticipants.values()) {
        if (existing.userId === userIdStr && existing.socket.id !== socket.id) {
          throw new AppError(
            409,
            'ALREADY_CONNECTED',
            'You are already connected to this video consultation in another tab or window'
          );
        }
      }

      // Check room capacity (max 2 participants)
      if (roomParticipants.size >= 2 && !roomParticipants.has(socket.id)) {
        throw new AppError(409, 'ROOM_FULL', 'Video consultation room is full');
      }

      // Join socket.io room
      socket.join(roomName);
      roomParticipants.set(socket.id, {
        userId: userIdStr,
        name: activeUser.name,
        role: activeUser.role,
        socket,
      });

      const iceServers = getIceServers();
      const isWaiting = roomParticipants.size === 1;
      const isInitiator = roomParticipants.size === 2;

      if (isWaiting) {
        // First participant in room: initialize / ensure session exists
        await videoService.getOrCreateSession(appointmentId);

        acknowledge(callback, {
          success: true,
          appointmentId,
          isWaiting: true,
          isInitiator: false,
          iceServers,
        });
      } else {
        // Second participant arrived: start session and begin signaling
        await videoService.startSession(appointmentId);

        // Acknowledge newcomer (designated initiator creates offer)
        acknowledge(callback, {
          success: true,
          appointmentId,
          isWaiting: false,
          isInitiator: true,
          iceServers,
        });

        // Notify existing waiting participant that peer joined
        socket.to(roomName).emit('peer_joined', {
          appointmentId,
          peer: {
            id: userIdStr,
            name: activeUser.name,
            role: activeUser.role,
          },
          isInitiator: false,
        });
      }
    } catch (err) {
      const status = err.status || 500;
      const code = err.code || (status === 500 ? 'INTERNAL_ERROR' : 'ERROR');
      const message = status === 500 ? 'Failed to join video call' : err.message;

      acknowledge(callback, { success: false, code, message });

      if (code === 'ACCOUNT_DISABLED') {
        socket.disconnect(true);
      }
    }
  });

  // Event: relay_offer
  // Relays WebRTC SDP offer to the other peer in the room.
  socket.on('relay_offer', async (payload, callback) => {
    try {
      await verifyActiveUser(socket);
      const data = parsePayload(payload);
      const appointmentId = validateAppointmentId(data.appointmentId);
      await checkAppointmentStatus(appointmentId, io);

      const roomParticipants = activeCallRooms.get(appointmentId);
      if (!roomParticipants || !roomParticipants.has(socket.id)) {
        throw new AppError(400, 'NOT_IN_ROOM', 'You are not in this video consultation room');
      }

      const roomName = `video:${appointmentId}`;
      const sdp = data.sdp || data.offer?.sdp;
      const type = data.type || data.offer?.type || 'offer';

      socket.to(roomName).emit('receive_offer', {
        appointmentId,
        offer: { type, sdp },
        sender: {
          id: socket.user._id.toString(),
          name: socket.user.name,
          role: socket.user.role,
        },
      });

      acknowledge(callback, { success: true });
    } catch (err) {
      const status = err.status || 500;
      const code = err.code || (status === 500 ? 'INTERNAL_ERROR' : 'ERROR');
      const message = status === 500 ? 'Failed to relay offer' : err.message;
      acknowledge(callback, { success: false, code, message });
    }
  });

  // Event: relay_answer
  // Relays WebRTC SDP answer to the other peer in the room.
  socket.on('relay_answer', async (payload, callback) => {
    try {
      await verifyActiveUser(socket);
      const data = parsePayload(payload);
      const appointmentId = validateAppointmentId(data.appointmentId);
      await checkAppointmentStatus(appointmentId, io);

      const roomParticipants = activeCallRooms.get(appointmentId);
      if (!roomParticipants || !roomParticipants.has(socket.id)) {
        throw new AppError(400, 'NOT_IN_ROOM', 'You are not in this video consultation room');
      }

      const roomName = `video:${appointmentId}`;
      const sdp = data.sdp || data.answer?.sdp;
      const type = data.type || data.answer?.type || 'answer';

      socket.to(roomName).emit('receive_answer', {
        appointmentId,
        answer: { type, sdp },
        sender: {
          id: socket.user._id.toString(),
          name: socket.user.name,
          role: socket.user.role,
        },
      });

      acknowledge(callback, { success: true });
    } catch (err) {
      const status = err.status || 500;
      const code = err.code || (status === 500 ? 'INTERNAL_ERROR' : 'ERROR');
      const message = status === 500 ? 'Failed to relay answer' : err.message;
      acknowledge(callback, { success: false, code, message });
    }
  });

  // Event: relay_candidate
  // Relays an ICE candidate to the other peer in the room.
  socket.on('relay_candidate', async (payload, callback) => {
    try {
      await verifyActiveUser(socket);
      const data = parsePayload(payload);
      const appointmentId = validateAppointmentId(data.appointmentId);
      await checkAppointmentStatus(appointmentId, io);

      const roomParticipants = activeCallRooms.get(appointmentId);
      if (!roomParticipants || !roomParticipants.has(socket.id)) {
        throw new AppError(400, 'NOT_IN_ROOM', 'You are not in this video consultation room');
      }

      const roomName = `video:${appointmentId}`;
      socket.to(roomName).emit('receive_candidate', {
        appointmentId,
        candidate: data.candidate,
        sender: {
          id: socket.user._id.toString(),
          name: socket.user.name,
        },
      });

      acknowledge(callback, { success: true });
    } catch (err) {
      const status = err.status || 500;
      const code = err.code || (status === 500 ? 'INTERNAL_ERROR' : 'ERROR');
      const message = status === 500 ? 'Failed to relay ICE candidate' : err.message;
      acknowledge(callback, { success: false, code, message });
    }
  });

  // Event: leave_video / end_call
  // Client voluntarily leaves or explicitly terminates the call.
  socket.on('leave_video', async (payload, callback) => {
    try {
      const data = parsePayload(payload);
      const appointmentId = validateAppointmentId(data.appointmentId);
      const isExplicit = Boolean(data.isExplicit);

      const roomParticipants = activeCallRooms.get(appointmentId);
      const roomName = `video:${appointmentId}`;

      if (roomParticipants && roomParticipants.has(socket.id)) {
        roomParticipants.delete(socket.id);
        socket.leave(roomName);

        if (isExplicit) {
          // Explicit call termination: cannot be rejoined
          await videoService.endSession(appointmentId, {
            isExplicit: true,
            reason: 'call_ended',
          });

          io.to(roomName).emit('call_ended', {
            appointmentId,
            reason: 'call_ended',
            message: 'The consultation has been ended by a participant',
          });

          // Remove remaining participants from the room
          for (const remaining of roomParticipants.values()) {
            remaining.socket.leave(roomName);
          }
          activeCallRooms.delete(appointmentId);
        } else {
          // Left the room without explicit end (or temporary disconnect)
          if (roomParticipants.size > 0) {
            socket.to(roomName).emit('peer_left', {
              appointmentId,
              peer: {
                id: socket.user?._id?.toString() || 'unknown',
                name: socket.user?.name || 'User',
              },
            });
            await videoService.endSession(appointmentId, {
              isExplicit: false,
              reason: 'disconnected',
            });
          } else {
            activeCallRooms.delete(appointmentId);
            await videoService.endSession(appointmentId, {
              isExplicit: false,
              reason: 'disconnected',
            });
          }
        }
      }

      acknowledge(callback, { success: true });
    } catch (err) {
      const status = err.status || 500;
      const code = err.code || (status === 500 ? 'INTERNAL_ERROR' : 'ERROR');
      const message = status === 500 ? 'Failed to leave video call' : err.message;
      acknowledge(callback, { success: false, code, message });
    }
  });

  // Socket disconnect cleanup
  socket.on('disconnect', async () => {
    try {
      for (const [appointmentId, roomParticipants] of activeCallRooms.entries()) {
        if (roomParticipants.has(socket.id)) {
          roomParticipants.delete(socket.id);
          const roomName = `video:${appointmentId}`;

          if (roomParticipants.size > 0) {
            socket.to(roomName).emit('peer_left', {
              appointmentId,
              peer: {
                id: socket.user?._id?.toString() || 'unknown',
                name: socket.user?.name || 'User',
              },
            });
            await videoService.endSession(appointmentId, {
              isExplicit: false,
              reason: 'disconnected',
            });
          } else {
            activeCallRooms.delete(appointmentId);
            await videoService.endSession(appointmentId, {
              isExplicit: false,
              reason: 'disconnected',
            });
          }
        }
      }
    } catch (err) {
      // Catch socket disconnect cleanup errors safely
    }
  });
}

module.exports = {
  registerVideoHandlers,
  _resetCallRooms,
  _getActiveCallRooms,
};
