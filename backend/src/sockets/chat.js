const chatService = require('../services/chatService');
const { validateAppointmentId } = require('../utils/validateChat');

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
      const data =
        payload !== null && typeof payload === 'object' && !Array.isArray(payload)
          ? payload
          : typeof payload === 'string'
            ? { appointmentId: payload }
            : {};

      const appointmentId = validateAppointmentId(data.appointmentId);

      // Verify that socket.user is a participant and the appointment status permits chat
      await chatService.verifyChatAccess(appointmentId, socket.user, { checkSend: false });

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
    }
  });

  // Event: send_message
  // Client sends a consultation chat message.
  socket.on('send_message', async (payload, callback) => {
    try {
      const data =
        payload !== null && typeof payload === 'object' && !Array.isArray(payload)
          ? payload
          : {};

      const appointmentId = validateAppointmentId(data.appointmentId);

      // Persist the message with atomic sequence assignment
      const savedMessage = await chatService.createMessage({
        appointmentId,
        user: socket.user,
        content: data.content,
      });

      const roomName = `appointment:${appointmentId}`;

      // Broadcast the new message to everyone in the appointment's room (including sender)
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
    }
  });
}

module.exports = {
  registerChatHandlers,
};
