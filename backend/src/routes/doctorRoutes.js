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

module.exports = router;
