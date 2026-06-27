const submissionService = require('../services/submissionService');
const authzService = require('../services/authzService');
const { successResponse } = require('../utils/responses');
const { catchAsync } = require('../middlewares/errorHandler');

/**
 * Submit task with files
 * POST /api/submissions/:taskId
 */
exports.submitTask = catchAsync(async (req, res) => {
  const { taskId } = req.params;
  const menteeId = req.user.id;
  const files = req.files || [];

  const submission = await submissionService.submitTaskWithFiles(
    taskId,
    menteeId,
    req.body,
    files
  );

  res.status(201).json(
    successResponse('Task submitted successfully', { submission }, 201)
  );
});

/**
 * Request extension for a task
 * POST /api/submissions/:taskId/extension
 */
exports.requestExtension = catchAsync(async (req, res) => {
  const { taskId } = req.params;
  const menteeId = req.user.id;

  const submission = await submissionService.requestExtension(
    taskId,
    menteeId,
    req.body
  );

  res.status(201).json(
    successResponse('Extension request submitted', { submission }, 201)
  );
});

/**
 * Get all submissions for a task
 * GET /api/submissions/task/:taskId
 */
exports.getTaskSubmissions = catchAsync(async (req, res) => {
  const { taskId } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  const submissions = await submissionService.getTaskSubmissions(
    taskId,
    userId,
    userRole
  );

  res.status(200).json(
    successResponse('Submissions retrieved', { submissions })
  );
});

/**
 * Get single submission
 * GET /api/submissions/:submissionId
 */
exports.getSubmission = catchAsync(async (req, res) => {
  const { submissionId } = req.params;

  const submission = await submissionService.getSubmissionById(submissionId);

  // Ownership via scoped RBAC (replaces the legacy "you must be THE assigning
  // mentor" check that blocked co-mentors / cross-clan cover): the mentee sees
  // their own submission; anyone else must be able to view the task's mentee.
  const assignments = req.loadAssignments ? await req.loadAssignments() : undefined;
  const allowed = await authzService.canViewMentee(req.user, submission.assignedTask.menteeId, { assignments });
  if (!allowed) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  res.status(200).json(
    successResponse('Submission retrieved', { submission })
  );
});

/**
 * Review submission
 * POST /api/submissions/:submissionId/review
 */
exports.reviewSubmission = catchAsync(async (req, res) => {
  const { submissionId } = req.params;
  const mentorId = req.user.id;

  console.time(`[API] reviewSubmission ${submissionId}`);
  const submission = await submissionService.reviewSubmission(
    submissionId,
    mentorId,
    req.body
  );
  console.timeEnd(`[API] reviewSubmission ${submissionId}`);

  res.status(200).json(
    successResponse('Review submitted successfully', { submission })
  );
});

/**
 * Edit an already-submitted review (feedback text, inline notes, rating, and
 * points). Only the reviewing mentor may edit; the decision is unchanged.
 * PATCH /api/submissions/:submissionId/review
 */
exports.editReview = catchAsync(async (req, res) => {
  const { submissionId } = req.params;
  const mentorId = req.user.id;

  const submission = await submissionService.editReview(
    submissionId,
    mentorId,
    req.body
  );

  res.status(200).json(
    successResponse('Review updated successfully', { submission })
  );
});

/**
 * Handle extension request (approve/reject)
 * POST /api/submissions/:submissionId/extension/handle
 */
exports.handleExtension = catchAsync(async (req, res) => {
  const { submissionId } = req.params;
  const mentorId = req.user.id;
  const { approved, newDueDate } = req.body;

  const submission = await submissionService.handleExtensionRequest(
    submissionId,
    mentorId,
    approved,
    newDueDate
  );

  res.status(200).json(
    successResponse(
      `Extension ${approved ? 'approved' : 'rejected'}`,
      { submission }
    )
  );
});

/**
 * Delete file from submission
 * DELETE /api/submissions/files/:fileId
 */
exports.deleteFile = catchAsync(async (req, res) => {
  const { fileId } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  const result = await submissionService.deleteSubmissionFile(
    fileId,
    userId,
    userRole
  );

  res.status(200).json(successResponse(result.message));
});

/**
 * Get pending submissions for mentor
 * GET /api/submissions/mentor/:mentorId/pending
 */
exports.getPendingSubmissions = catchAsync(async (req, res) => {
  const { mentorId } = req.params;

  // Security: only an admin may read another mentor's pending submissions;
  // everyone else is restricted to their own (derived capabilities, not role).
  const isAdmin = req.loadCapabilities ? (await req.loadCapabilities()).includes('admin') : req.user.role === 'admin';
  if (!isAdmin && req.user.id !== mentorId) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  const { models } = require('../db');

  const submissions = await models.TaskSubmission.findAll({
    where: {
      status: 'pending'
    },
    include: [
      {
        model: models.AssignedTask,
        as: 'assignedTask',
        where: { mentorId },
        include: [
          {
            model: models.RoadmapTask,
            as: 'roadmapTask'
          },
          {
            model: models.User,
            as: 'mentee',
            attributes: ['id', 'firstName', 'lastName', 'email']
          }
        ]
      },
      {
        model: models.TaskSubmissionFile,
        as: 'files'
      }
    ],
    order: [['submittedAt', 'ASC']]
  });

  res.status(200).json(
    successResponse('Pending submissions retrieved', { submissions })
  );
});

module.exports = exports;
