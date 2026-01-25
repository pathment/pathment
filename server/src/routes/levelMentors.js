const express = require('express');
const router = express.Router({ mergeParams: true });
const levelMentorController = require('../controllers/levelMentorController');
const { authenticate, authorize } = require('../middlewares/auth');

// All routes require admin authentication
router.use(authenticate, authorize(['admin']));

// Program-level routes
router.get('/programs/:programId/mentor-assignments', levelMentorController.getProgramMentorAssignments);

// Level-specific routes
router.post('/programs/:programId/levels/:levelId/mentors', levelMentorController.assignMentorToLevel);
router.get('/programs/:programId/levels/:levelId/mentors', levelMentorController.getLevelMentors);
router.delete('/programs/:programId/levels/:levelId/mentors/:mentorId', levelMentorController.removeMentorFromLevel);

module.exports = router;
