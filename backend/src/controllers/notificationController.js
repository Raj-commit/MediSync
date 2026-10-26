const notificationService = require('../services/notificationService');

// GET /api/v1/notifications
// Lists notifications for the authenticated patient or doctor with pagination and unreadCount.
async function getNotifications(req, res) {
  const result = await notificationService.getNotifications(req.user, req.query);
  res.status(200).json(result);
}

// PATCH /api/v1/notifications/:id/read
// Marks a single notification as read and returns { notification }.
async function markAsRead(req, res) {
  const result = await notificationService.markAsRead(req.user, req.params.id, req.body);
  res.status(200).json(result);
}

module.exports = {
  getNotifications,
  markAsRead,
};
