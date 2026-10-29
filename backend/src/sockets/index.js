const { Server } = require('socket.io');
const mongoose = require('mongoose');
const { User } = require('../models/User');
const { verifyToken } = require('../utils/token');
const { registerChatHandlers } = require('./chat');

let io = null;

/**
 * Initializes Socket.IO on the HTTP server with JWT authentication and per-user rooms.
 */
function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || false,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Authenticate socket connections with JWT
  io.use(async (socket, next) => {
    try {
      const authHeader =
        socket.handshake.auth?.token || socket.handshake.headers?.authorization;

      if (!authHeader) {
        return next(new Error('Authentication error: Token required'));
      }

      const token =
        typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
          ? authHeader.slice(7).trim()
          : authHeader;

      let payload;
      try {
        payload = verifyToken(token);
      } catch (err) {
        return next(new Error('Authentication error: Invalid token'));
      }

      if (!payload.sub || !mongoose.isObjectIdOrHexString(payload.sub)) {
        return next(new Error('Authentication error: Invalid token subject'));
      }

      const user = await User.findById(payload.sub);
      if (!user || !user.isActive) {
        return next(new Error('Authentication error: User not found or inactive'));
      }

      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    // Join a private room for this user so we can emit targeted notifications
    const userRoom = `user:${socket.user._id.toString()}`;
    socket.join(userRoom);

    // Register consultation chat handlers (join_chat, send_message)
    registerChatHandlers(io, socket);

    socket.on('disconnect', () => {
      // Socket disconnected
    });
  });

  return io;
}

/**
 * Returns the active Socket.IO server instance.
 */
function getIO() {
  return io;
}

/**
 * Emits a real-time notification to a specific user's private room.
 */
function sendNotificationToUser(recipientId, notificationData) {
  if (!io) return;
  try {
    const userRoom = `user:${recipientId.toString()}`;
    io.to(userRoom).emit('notification', notificationData);
  } catch (err) {
    console.error('Failed to emit live notification via socket:', err);
  }
}

/**
 * Closes the Socket.IO instance (useful for clean test teardowns).
 */
function closeSocket() {
  if (io) {
    io.close();
    io = null;
  }
}

module.exports = {
  initSocket,
  getIO,
  sendNotificationToUser,
  closeSocket,
};
