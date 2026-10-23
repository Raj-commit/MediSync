const express = require('express');
const userController = require('../controllers/userController');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');

const router = express.Router();

// Order of checks (AGENTS.md section 3 rule 4):
// 1. authenticate: checks valid JWT and loads req.user from DB
// 2. requireRole: patients and doctors only (admins rejected with 403 FORBIDDEN)
// 3. userController.getProfile: reads the authenticated user's own profile
router.get('/me', authenticate, requireRole('patient', 'doctor'), userController.getProfile);

module.exports = router;
