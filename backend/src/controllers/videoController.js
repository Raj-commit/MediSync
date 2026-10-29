const videoService = require('../services/videoService');
const { getIceServers } = require('../config/iceServers');
const {
  validateAppointmentId,
  validateEmptyBody,
  validateNoQuery,
} = require('../utils/validateVideo');

/**
 * GET /api/v1/appointments/:id/video
 * Returns call eligibility, reason, appointment details, session times,
 * and ICE servers (STUN/TURN) if joining is permitted.
 */
async function getVideoStatus(req, res) {
  validateEmptyBody(req.body);
  validateNoQuery(req.query);
  const appointmentId = validateAppointmentId(req.params.id);

  const statusData = await videoService.getVideoCallStatus(appointmentId, req.user);

  let iceServers = null;
  if (statusData.canJoin) {
    iceServers = getIceServers();
  }

  res.json({
    ...statusData,
    iceServers,
  });
}

module.exports = {
  getVideoStatus,
};
