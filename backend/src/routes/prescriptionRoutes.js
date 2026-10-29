const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const prescriptionController = require('../controllers/prescriptionController');

const router = express.Router();

/**
 * GET /api/v1/prescriptions
 * Protected: Patients list own, Doctors list issued. Supports ?appointmentId=... and pagination.
 * 1. authenticate: valid JWT
 * 2. requireRole: 'patient', 'doctor' (admins get 403)
 * 3. getPrescriptions: query validation, role-scoped lookup, pagination
 */
router.get(
  '/',
  authenticate,
  requireRole('patient', 'doctor'),
  prescriptionController.getPrescriptions
);

/**
 * POST /api/v1/prescriptions
 * Protected: Doctor creates digital prescription for their completed appointment.
 * 1. authenticate: valid JWT
 * 2. requireRole: doctors only
 * 3. createPrescription: business logic, ownership & status check, MongoDB save, PDF generation
 */
router.post(
  '/',
  authenticate,
  requireRole('doctor'),
  prescriptionController.createPrescription
);

module.exports = router;
