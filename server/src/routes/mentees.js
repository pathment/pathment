const express = require('express');
const router = express.Router();
const menteeController = require('../controllers/menteeController');
const { authenticate, authorize } = require('../middlewares/auth');

// Get all mentees with profile stats (admin only)
router.get('/', authenticate, authorize(['admin']), menteeController.getAllMentees);

// Get a single mentee's full profile (admin only)
router.get('/:id', authenticate, authorize(['admin']), menteeController.getMenteeById);

module.exports = router;
