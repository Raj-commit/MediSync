const express = require('express');
const appointmentController = require('../controllers/appointmentController');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');

const router = express.Router();

// GET /api/v1/appointments
// A logged-in patient or doctor lists their own appointments.
// Supports query filters: status, when (upcoming | past), page, limit.
router.get(
  '/',
  authenticate,
  requireRole('patient', 'doctor'),
  appointmentController.getAppointments
);

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

// PATCH /api/v1/appointments/:id
// Manage appointment (cancel, reschedule, accept, reject, complete)
// Order of checks (AGENTS.md section 3 rule 4):
// 1. authenticate: checks valid JWT and loads req.user from DB
// 2. requireRole: patients and doctors (admins receive 403 FORBIDDEN)
// 3. appointmentController.manageAppointment: checks appointmentId, body action, ownership, status transitions
router.patch(
  '/:id',
  authenticate,
  requireRole('patient', 'doctor'),
  appointmentController.manageAppointment
);

module.exports = router;
