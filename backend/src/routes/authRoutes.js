const express = require('express');
const authController = require('../controllers/authController');
const { createLoginLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

router.post('/register', authController.register);
router.post('/login', createLoginLimiter(), authController.login);

module.exports = router;