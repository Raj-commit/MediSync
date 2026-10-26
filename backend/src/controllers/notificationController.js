const notificationService = require('../services/notificationService');

// GET /api/v1/notifications
// Lists notifications for the authenticated patient or doctor with pagination and unreadCount.
async function getNotifications(req, res) {
  const result = await notificationService.getNotifications(req.user, req.query);
  res.status(200).json(result);
}

module.exports = {
  getNotifications,
};
