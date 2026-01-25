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

module.exports = router;
