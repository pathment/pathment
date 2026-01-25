const express = require('express');
const router = express.Router();
const mentorController = require('../controllers/mentorController');
const { authenticate, authorize } = require('../middlewares/auth');

// Get all active mentors (admin only)
router.get('/', authenticate, authorize(['admin']), mentorController.getAllMentors);

module.exports = router;
