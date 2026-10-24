const express = require('express');
const appointmentController = require('../controllers/appointmentController');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');

const router = express.Router();

// POST /api/v1/appointments
// A logged-in patient books one open slot of one doctor.
// Order of checks (AGENTS.md section 3 rule 4):
// 1. authenticate: checks valid JWT and loads req.user from DB
// 2. requireRole: patients only (doctors and admins receive 403 FORBIDDEN)
// 3. appointmentController.bookAppointment: checks input, slot, doctor, claims slot, and creates appointment
router.post(
  '/',
  authenticate,
  requireRole('patient'),
  appointmentController.bookAppointment
);

module.exports = router;
