const express = require('express');
const router = express.Router();
const enrollmentController = require('../controllers/enrollmentController');
const { authenticate, authorize } = require('../middlewares/auth');

router.get('/', authenticate, authorize(['admin', 'mentor', 'mentee']), enrollmentController.getEnrollments);
router.get('/:id', authenticate, enrollmentController.getEnrollmentById);
router.post('/', authenticate, authorize(['mentee']), enrollmentController.createEnrollment);
router.patch('/:id/status', authenticate, enrollmentController.updateEnrollmentStatus);
router.post('/:id/approve', authenticate, authorize(['admin']), enrollmentController.approveEnrollment);
router.post('/:id/reject', authenticate, authorize(['admin']), enrollmentController.rejectEnrollment);

// ─── Level completion & progression ──────────────────────────────────────────
// Mentee or Mentor: request completion of current level
router.post('/:id/request-completion', authenticate, authorize(['mentee', 'mentor']), enrollmentController.requestCompletion);
// Mentor or Admin: approve the completion request
router.post('/:id/approve-completion', authenticate, authorize(['mentor', 'admin']), enrollmentController.approveCompletion);
// Mentor or Admin: reject the completion request (send back to active)
router.post('/:id/reject-completion',  authenticate, authorize(['mentor', 'admin']), enrollmentController.rejectCompletion);
// Admin: promote level_completed mentee to the next program level
router.post('/:id/promote-next-level', authenticate, authorize(['admin']), enrollmentController.promoteToNextLevel);
// Admin: remove (unenroll) a mentee from a program
router.delete('/:id', authenticate, authorize(['admin']), enrollmentController.removeEnrollment);

module.exports = router;
