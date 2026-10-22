const express = require('express');
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { createLoginLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

router.post('/register', authController.register);
router.post('/login', createLoginLimiter(), authController.login);
router.get('/me', authenticate, authController.me);

module.exports = router;