const programService = require('../services/programService');
const { successResponse, paginatedResponse } = require('../utils/responses');
const { catchAsync } = require('../middlewares/errorHandler');

class ProgramController {
  /**
   * Create a new program
   * @route POST /api/programs
   * @access Admin, Mentor
   */
  createProgram = catchAsync(async (req, res) => {
    const program = await programService.createProgram(req.body, req.user.id);

    return successResponse(res, {
      message: 'Program created successfully',
      statusCode: 201,
      data: { program }
    });
  });

  /**
   * Get all programs with filters
   * @route GET /api/programs
   * @access Public (published), Admin/Creator (all)
   */
  getPrograms = catchAsync(async (req, res) => {
    const result = await programService.getPrograms(
      req.query,
      req.user?.id,
      req.user?.role
    );

    return paginatedResponse(res, {
      message: 'Programs retrieved successfully',
      data: result.programs,
      pagination: result.pagination
    });
  });

  /**
   * Get program by ID
   * @route GET /api/programs/:id
   * @access Public (published), Admin/Creator (all)
   */
  getProgramById = catchAsync(async (req, res) => {
    const program = await programService.getProgramById(
      req.params.id,
      req.user?.id,
      req.user?.role
    );

    return successResponse(res, {
      message: 'Program retrieved successfully',
      data: { program }
    });
  });

  /**
   * Update program
   * @route PUT /api/programs/:id
   * @access Admin, Creator
   */
  updateProgram = catchAsync(async (req, res) => {
    const program = await programService.updateProgram(
      req.params.id,
      req.body,
      req.user.id,
      req.user.role
    );

    return successResponse(res, {
      message: 'Program updated successfully',
      data: { program }
    });
  });

  /**
   * Delete program
   * @route DELETE /api/programs/:id
   * @access Admin, Creator
   */
  deleteProgram = catchAsync(async (req, res) => {
    const result = await programService.deleteProgram(
      req.params.id,
      req.user.id,
      req.user.role
    );

    return successResponse(res, {
      message: result.message,
      statusCode: 200
    });
  });

  /**
   * Enroll in program
   * @route POST /api/programs/:id/enroll
   * @access Mentee
   */
  enrollInProgram = catchAsync(async (req, res) => {
    const enrollment = await programService.enrollMentee(
      req.params.id,
      req.user.id
    );

    return successResponse(res, {
      message: 'Successfully enrolled in program',
      statusCode: 201,
      data: { enrollment }
    });
  });

  /**
   * Get program enrollments
   * @route GET /api/programs/:id/enrollments
   * @access Admin, Creator
   */
  getProgramEnrollments = catchAsync(async (req, res) => {
    const enrollments = await programService.getProgramEnrollments(
      req.params.id,
      req.user.id,
      req.user.role
    );

    return successResponse(res, {
      message: 'Enrollments retrieved successfully',
      data: { enrollments }
    });
  });

  /**
   * Clone program
   * @route POST /api/programs/:id/clone
   * @access Admin, Mentor
   */
  cloneProgram = catchAsync(async (req, res) => {
    const program = await programService.cloneProgram(
      req.params.id,
      req.user.id,
      req.body
    );

    return successResponse(res, {
      message: 'Program cloned successfully',
      statusCode: 201,
      data: { program }
    });
  });

  /**
   * Get program statistics
   * @route GET /api/programs/:id/stats
   * @access Admin, Creator
   */
  getProgramStats = catchAsync(async (req, res) => {
    const stats = await programService.getProgramStats(
      req.params.id,
      req.user.id,
      req.user.role
    );

    return successResponse(res, {
      message: 'Program statistics retrieved successfully',
      data: stats
    });
  });
}

module.exports = new ProgramController();
