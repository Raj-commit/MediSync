const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const recordController = require('../controllers/recordController');

const router = express.Router();

// Order of checks (AGENTS.md section 3 rule 4):
// 1. authenticate: checks valid JWT and loads req.user from DB
// 2. requireRole: patients only (doctors and admins rejected with 403 FORBIDDEN)
// 3. getOwnRecord: accesses only req.user's own medical record
router.get(
  '/me',
  authenticate,
  requireRole('patient'),
  recordController.getOwnRecord
);

// Doctor reads record of a patient they have an appointment with
// 1. authenticate: checks valid JWT
// 2. requireRole: doctors only (patients and admins rejected with 403 FORBIDDEN)
// 3. getPatientRecordByDoctor: checks confirmed/completed appointment and ownership
router.get(
  '/patient/:patientId',
  authenticate,
  requireRole('doctor'),
  recordController.getPatientRecordByDoctor
);

module.exports = router;
