const chatService = require('../services/chatService');
const {
  validateAppointmentId,
  validateEmptyBody,
  validateChatMessagesQuery,
} = require('../utils/validateChat');

/**
 * GET /api/v1/appointments/:id/messages
 * Retrieves paginated messages for a confirmed or completed appointment.
 */
async function getMessages(req, res) {
  validateEmptyBody(req.body);
  const appointmentId = validateAppointmentId(req.params.id);
  const query = validateChatMessagesQuery(req.query);

  const result = await chatService.listMessages({
    appointmentId,
    user: req.user,
    limit: query.limit,
    beforeSeq: query.beforeSeq,
    afterSeq: query.afterSeq,
  });

  res.json(result);
}

module.exports = {
  getMessages,
};
