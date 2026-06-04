const express = require('express');
const router = express.Router();
const programReviewController = require('../controllers/programReviewController');
const { authenticate, authorize } = require('../middlewares/auth');

// Mentee: submit / read own anonymous feedback for a completed enrollment
router.post('/enrollment/:enrollmentId', authenticate, authorize(['mentee']), programReviewController.submitReview);
router.get('/enrollment/:enrollmentId/me', authenticate, authorize(['mentee']), programReviewController.getMyReview);

// Mentor: own aggregate (anonymized, gated by a minimum response count)
router.get('/mentor/me/summary', authenticate, authorize(['mentor']), programReviewController.getMyFeedbackSummary);

// Admin: moderation view of a mentor's raw feedback
router.get('/mentor/:mentorId/admin', authenticate, authorize(['admin']), programReviewController.getMentorFeedbackForAdmin);

module.exports = router;
