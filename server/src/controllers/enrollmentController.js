const enrollmentService = require('../services/enrollmentService');
const { successResponse } = require('../utils/responses');
const { catchAsync } = require('../middlewares/errorHandler');

/**
 * Get all enrollments with filters
 * GET /api/enrollments
 */
exports.getEnrollments = catchAsync(async (req, res) => {
  const { status, programId, menteeId, search, page, limit } = req.query;
  
  // If user is a mentee, restrict to their own enrollments
  let filters = { status, programId, menteeId, search };
  if (req.user.role === 'mentee') {
    filters.menteeId = req.user.id;
  }
  
  const pagination = { page: parseInt(page) || 1, limit: parseInt(limit) || 20 };
  
  const result = await enrollmentService.getEnrollments(filters, pagination);
  res.status(200).json(successResponse('Enrollments retrieved successfully', result));
});

/**
 * Get enrollment by ID
 * GET /api/enrollments/:id
 */
exports.getEnrollmentById = catchAsync(async (req, res) => {
  const { id } = req.params;
  const enrollment = await enrollmentService.getEnrollmentById(id);
  res.status(200).json(successResponse('Enrollment retrieved successfully', { enrollment }));
});

/**
 * Create enrollment (mentee enrolls in program)
 * POST /api/enrollments
 */
exports.createEnrollment = catchAsync(async (req, res) => {
  const { programId } = req.body;
  const menteeId = req.user.id;
  
  const enrollment = await enrollmentService.createEnrollment(programId, menteeId);
  res.status(201).json(successResponse('Enrolled successfully', { enrollment }, 201));
});

/**
 * Update enrollment status
 * PATCH /api/enrollments/:id/status
 */
exports.updateEnrollmentStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  const enrollment = await enrollmentService.updateEnrollmentStatus(id, status, req.user.id, req.user.role);
  res.status(200).json(successResponse('Enrollment status updated', { enrollment }));
});

/**
 * Approve enrollment (admin only)
 * POST /api/enrollments/:id/approve
 */
exports.approveEnrollment = catchAsync(async (req, res) => {
  const { id } = req.params;
  const taskService = require('../services/taskService');
  
  // Approve the enrollment
  const enrollment = await enrollmentService.updateEnrollmentStatus(id, 'approved', req.user.id, req.user.role);
  
  // Auto-assign Week 1 roadmap tasks to the mentee
  try {
    await taskService.autoAssignWeekTasks(id, 1);
    console.log(`✓ Auto-assigned Week 1 tasks for enrollment ${id}`);
  } catch (error) {
    console.error(`Failed to auto-assign tasks for enrollment ${id}:`, error.message);
    // Don't fail the approval if task assignment fails
  }
  
  res.status(200).json(successResponse('Enrollment approved and Week 1 tasks assigned', { enrollment }));
});

/**
 * Reject enrollment (admin only)
 * POST /api/enrollments/:id/reject
 */
exports.rejectEnrollment = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  
  const enrollment = await enrollmentService.updateEnrollmentStatus(id, 'rejected', req.user.id, req.user.role, reason);
  res.status(200).json(successResponse('Enrollment rejected', { enrollment }));
});

/**
 * Request completion of current level/program (mentee or mentor)
 * POST /api/enrollments/:id/request-completion
 */
exports.requestCompletion = catchAsync(async (req, res) => {
  const { id } = req.params;
  const enrollment = await enrollmentService.requestCompletion(id, req.user.id, req.user.role);
  res.status(200).json(successResponse('Completion requested — awaiting mentor/admin approval', { enrollment }));
});

/**
 * Approve completion (mentor or admin)
 * POST /api/enrollments/:id/approve-completion
 */
exports.approveCompletion = catchAsync(async (req, res) => {
  const { id } = req.params;
  const result = await enrollmentService.approveCompletion(id, req.user.id, req.user.role);
  const message = result.hasNextLevel
    ? `Level completed — mentee is ready to be promoted to "${result.nextLevelName}"`
    : 'Program completed — mentee has finished all levels';
  res.status(200).json(successResponse(message, result));
});

/**
 * Reject completion request (mentor or admin)
 * POST /api/enrollments/:id/reject-completion
 */
exports.rejectCompletion = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const enrollment = await enrollmentService.rejectCompletion(id, req.user.id, req.user.role, reason);
  res.status(200).json(successResponse('Completion request rejected — enrollment remains active', { enrollment }));
});

/**
 * Promote mentee to next level (admin only)
 * POST /api/enrollments/:id/promote-next-level
 */
exports.promoteToNextLevel = catchAsync(async (req, res) => {
  const { id } = req.params;
  const result = await enrollmentService.promoteToNextLevel(id, req.user.id);
  res.status(200).json(successResponse(
    `Mentee promoted to "${result.promotedToLevel.name}" — assign a mentor to continue`,
    result
  ));
});

/**
 * Remove enrollment (admin only)
 * DELETE /api/enrollments/:id
 */
exports.removeEnrollment = catchAsync(async (req, res) => {
  const { id } = req.params;
  const result = await enrollmentService.removeEnrollment(id, req.user.id);
  res.status(200).json(successResponse(result.message, {}));
});

module.exports = exports;
