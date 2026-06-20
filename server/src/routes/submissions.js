const express = require('express');
const router = express.Router();
const submissionController = require('../controllers/submissionController');
const { authenticate, authorize } = require('../middlewares/auth');
const { requirePermission, scope } = require('../middlewares/authz');
const { PERMISSIONS } = require('../config/permissions');
const upload = require('../middlewares/upload');

/**
 * @route   POST /api/submissions/:taskId
 * @desc    Submit task with files and rich text
 * @access  Mentee
 */
router.post(
  '/:taskId',
  authenticate,
  authorize(['mentee']),
  upload.arraySafe('files', 5), // Allow up to 5 files (clean 400 on type/size errors)
  submissionController.submitTask
);

/**
 * @route   POST /api/submissions/:taskId/extension
 * @desc    Request extension for a task
 * @access  Mentee
 */
router.post(
  '/:taskId/extension',
  authenticate,
  authorize(['mentee']),
  submissionController.requestExtension
);

/**
 * @route   GET /api/submissions/task/:taskId
 * @desc    Get all submissions for a task
 * @access  Mentee (own), Mentor (assigned), Admin
 */
router.get(
  '/task/:taskId',
  authenticate,
  authorize(['mentee', 'mentor', 'admin']),
  submissionController.getTaskSubmissions
);

/**
 * @route   GET /api/submissions/:submissionId
 * @desc    Get single submission by ID
 * @access  Mentee (own), Mentor (assigned), Admin
 */
router.get(
  '/:submissionId',
  authenticate,
  authorize(['mentee', 'mentor', 'admin']),
  submissionController.getSubmission
);

/**
 * @route   POST /api/submissions/:submissionId/review
 * @desc    Review submission with feedback and rating
 * @access  Mentor, Admin
 */
router.post(
  '/:submissionId/review',
  authenticate,
  requirePermission(PERMISSIONS.TASK_REVIEW, scope.submission('submissionId')),
  submissionController.reviewSubmission
);

/**
 * @route   PATCH /api/submissions/:submissionId/review
 * @desc    Edit an already-submitted review (feedback, rating, points). Only the
 *          reviewing mentor may edit; the decision is unchanged.
 * @access  Mentor (original reviewer), Admin
 */
router.patch(
  '/:submissionId/review',
  authenticate,
  requirePermission(PERMISSIONS.TASK_REVIEW, scope.submission('submissionId')),
  submissionController.editReview
);

/**
 * @route   POST /api/submissions/:submissionId/extension/handle
 * @desc    Approve or reject extension request
 * @access  Mentor, Admin
 */
router.post(
  '/:submissionId/extension/handle',
  authenticate,
  requirePermission(PERMISSIONS.TASK_REVIEW, scope.submission('submissionId')),
  submissionController.handleExtension
);

/**
 * @route   DELETE /api/submissions/files/:fileId
 * @desc    Delete file from submission
 * @access  Mentee (own, before review)
 */
router.delete(
  '/files/:fileId',
  authenticate,
  authorize(['mentee']),
  submissionController.deleteFile
);

/**
 * @route   GET /api/submissions/mentor/:mentorId/pending
 * @desc    Get pending submissions for a mentor to review
 * @access  Mentor (own), Admin
 */
router.get(
  '/mentor/:mentorId/pending',
  authenticate,
  authorize(['mentor', 'admin']),
  submissionController.getPendingSubmissions
);

module.exports = router;
