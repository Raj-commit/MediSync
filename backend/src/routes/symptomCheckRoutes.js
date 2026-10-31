const express = require("express");
const { authenticate } = require("../middleware/auth");
const { requireRole } = require("../middleware/requireRole");
const { createSymptomCheckLimiter } = require("../middleware/rateLimiters");
const symptomCheckController = require("../controllers/symptomCheckController");

const router = express.Router();
const symptomCheckLimiter = createSymptomCheckLimiter();

/**
 * GET /api/v1/symptom-checks
 * Protected: Patients list their own symptom check assessments (newest first).
 * 1. authenticate: valid JWT
 * 2. requireRole: 'patient' (doctors and admins receive 403 FORBIDDEN)
 * 3. getSymptomChecks: query validation, role-scoped lookup, pagination
 */
router.get(
  "/",
  authenticate,
  requireRole("patient"),
  symptomCheckController.getSymptomChecks,
);

/**
 * POST /api/v1/symptom-checks
 * Protected: Authenticated patient submits symptoms for preliminary assessment.
 * 1. authenticate: valid JWT
 * 2. requireRole: 'patient' (doctors and admins receive 403 FORBIDDEN)
 * 3. symptomCheckLimiter: 10 requests / 15 min per patient ID
 * 4. checkSymptoms: input validation, Django call, MongoDB save, HTTP 201 response
 */
router.post(
  "/",
  authenticate,
  requireRole("patient"),
  symptomCheckLimiter,
  symptomCheckController.checkSymptoms,
);

module.exports = router;
