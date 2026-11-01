const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const adminController = require('../controllers/adminController');

const router = express.Router();

// Strict security: all admin routes require a verified JWT and the 'admin' role
router.use(authenticate, requireRole('admin'));

router.get('/users', adminController.getUsers);
router.patch('/users/:id', adminController.patchUserStatus);

module.exports = router;
