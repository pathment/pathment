const adminService = require('../services/adminService');
const matchingService = require('../services/matchingService');
const { successResponse } = require('../utils/responses');
const { USER_MESSAGES } = require('../utils/responses/messages');
const { catchAsync } = require('../middlewares/errorHandler');
const { models } = require('../db');

class AdminController {
  /**
   * Create new admin user
   * POST /api/admin/create
   */
  createAdmin = catchAsync(async (req, res) => {
    const admin = await adminService.createAdmin(req.body, req.user.id);

    res.status(201).json(
      successResponse(
        'Admin user created successfully',
        { admin },
        201
      )
    );
  });

  /**
   * Update admin permissions
   * PUT /api/admin/:id/permissions
   */
  updatePermissions = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { permissions } = req.body;

    const adminProfile = await adminService.updateAdminPermissions(
      id,
      permissions,
      req.user.id
    );

    res.status(200).json(
      successResponse(
        'Admin permissions updated successfully',
        { adminProfile }
      )
    );
  });

  /**
   * Get dashboard statistics
   * GET /api/admin/dashboard/stats
   */
  getDashboardStats = catchAsync(async (req, res) => {
    const stats = await adminService.getDashboardStats();

    res.status(200).json(
      successResponse(
        'Dashboard statistics retrieved successfully',
        stats
      )
    );
  });

  /**
   * Recalculate all mentor mentee counts
   * POST /api/admin/recalculate-mentor-counts
   */
  recalculateMentorCounts = catchAsync(async (req, res) => {
    // Get all mentors
    const mentors = await models.User.findAll({
      where: { role: 'mentor' },
      include: [{ model: models.MentorProfile, as: 'mentorProfile' }]
    });

    let updated = 0;
    const results = [];

    for (const mentor of mentors) {
      if (mentor.mentorProfile) {
        const count = await matchingService.updateMentorMenteeCount(mentor.id);
        results.push({
          mentorId: mentor.id,
          name: `${mentor.firstName} ${mentor.lastName}`,
          currentMenteeCount: count
        });
        updated++;
      }
    }

    res.status(200).json(
      successResponse(
        `Successfully recalculated counts for ${updated} mentors`,
        { mentors: results, totalUpdated: updated }
      )
    );
  });
}

module.exports = new AdminController();
