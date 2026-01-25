const enrollmentService = require('../services/enrollmentService');
const { successResponse } = require('../utils/responses');
const { catchAsync } = require('../middlewares/errorHandler');

/**
 * Get all enrollments with filters
 * GET /api/enrollments
 */
exports.getEnrollments = catchAsync(async (req, res) => {
  const { status, programId, menteeId, page, limit } = req.query;
  
  // If user is a mentee, restrict to their own enrollments
  let filters = { status, programId, menteeId };
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
  
  const enrollment = await enrollmentService.updateEnrollmentStatus(id, 'approved', req.user.id, req.user.role);
  res.status(200).json(successResponse('Enrollment approved successfully', { enrollment }));
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

module.exports = exports;
