const express = require('express');
const notificationController = require('../controllers/notificationController');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');

const router = express.Router();

// Order of checks (AGENTS.md section 3 rule 4):
// 1. authenticate: checks valid JWT and loads req.user from DB
// 2. requireRole: patients and doctors only (admins rejected with 403 FORBIDDEN)
// 3. notificationController: accesses only req.user's own notifications
router.get(
  '/',
  authenticate,
  requireRole('patient', 'doctor'),
  notificationController.getNotifications
);

module.exports = router;
