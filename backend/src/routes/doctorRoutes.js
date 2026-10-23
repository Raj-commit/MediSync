const express = require('express');
const doctorController = require('../controllers/doctorController');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');

const router = express.Router();

// Order of checks (AGENTS.md section 3 rule 4):
// 1. authenticate: checks valid JWT and loads req.user from DB
// 2. requireRole: patients only (doctors and admins receive 403 FORBIDDEN)
// 3. doctorController.listDoctors: lists active doctors with optional search & pagination
router.get('/', authenticate, requireRole('patient'), doctorController.listDoctors);

// GET /api/v1/doctors/me/availability
// The logged-in doctor lists their own future slots (booked and open).
// Defined BEFORE /:id/availability so Express doesn't match "me" as an id.
router.get(
  '/me/availability',
  authenticate,
  requireRole('doctor'),
  doctorController.getMyAvailability
);

// PUT /api/v1/doctors/me/availability
// The logged-in doctor sets or updates their future availability slots.
router.put(
  '/me/availability',
  authenticate,
  requireRole('doctor'),
  doctorController.updateMyAvailability
);

// GET /api/v1/doctors/:id/availability
// A logged-in patient views one doctor's open future slots (not booked).
// Order of checks (AGENTS.md section 3 rule 4):
// 1. authenticate: checks valid JWT and loads req.user from DB
// 2. requireRole: patients only (doctors and admins receive 403 FORBIDDEN)
// 3. doctorController.getDoctorAvailability: validates doctor and returns open future slots
router.get(
  '/:id/availability',
  authenticate,
  requireRole('patient'),
  doctorController.getDoctorAvailability
);

module.exports = router;
