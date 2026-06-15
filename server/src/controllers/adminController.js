const adminService = require('../services/adminService');
const matchingService = require('../services/matchingService');
const authzService = require('../services/authzService');
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
   * Create registration invite
   * POST /api/admin/invites
   */
  createRegistrationInvite = catchAsync(async (req, res) => {
    // A program_admin may only invite into programs they administer.
    await authzService.assertProgramInScope(req.user, req.body.programId, {
      assignments: req.loadAssignments ? await req.loadAssignments() : undefined
    });
    const invite = await adminService.createRegistrationInvite(req.body, req.user.id);

    res.status(201).json(
      successResponse('Registration invite created successfully', { invite }, 201)
    );
  });

  /**
   * List registration invites
   * GET /api/admin/invites
   */
  listRegistrationInvites = catchAsync(async (req, res) => {
    const { status = 'active', limit = 50, offset = 0, programId, clanId, search } = req.query;
    const programScope = await authzService.adminProgramScope(req.user, {
      assignments: req.loadAssignments ? await req.loadAssignments() : undefined
    });
    const filters = { status, limit, offset };
    if (Array.isArray(programScope) && programScope.length) filters.programIds = programScope;
    if (programId) filters.programId = programId;
    if (clanId) filters.clanId = clanId;
    if (search && String(search).trim()) filters.search = String(search).trim();
    const result = await adminService.listRegistrationInvites(filters);

    res.status(200).json(
      successResponse('Registration invites retrieved successfully', result)
    );
  });

  /**
   * Revoke registration invite
   * POST /api/admin/invites/:id/revoke
   */
  revokeRegistrationInvite = catchAsync(async (req, res) => {
    const { id } = req.params;
    const invite = await adminService.revokeRegistrationInvite(id, req.user.id);

    res.status(200).json(
      successResponse('Registration invite revoked successfully', { invite })
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

  /**
   * Delete a user (mentee or mentor). Admin-only.
   * DELETE /api/admin/users/:id
   */
  deleteUser = catchAsync(async (req, res) => {
    const { id } = req.params;
    const result = await adminService.deleteUser(id, req.user.id);
    res.status(200).json(successResponse(result.message, {}));
  });

  /**
   * Suspend a user. Admin-only.
   * PUT /api/admin/users/:id/suspend
   */
  suspendUser = catchAsync(async (req, res) => {
    const { id } = req.params;
    const result = await adminService.suspendUser(id, req.user.id);
    res.status(200).json(successResponse(result.message, {}));
  });

  /**
   * Unsuspend a user. Admin-only.
   * PUT /api/admin/users/:id/unsuspend
   */
  unsuspendUser = catchAsync(async (req, res) => {
    const { id } = req.params;
    const result = await adminService.unsuspendUser(id, req.user.id);
    res.status(200).json(successResponse(result.message, {}));
  });

  /** Admin edits a user (name / email / base role). PATCH /api/admin/users/:id */
  updateUser = catchAsync(async (req, res) => {
    const user = await adminService.updateUser(req.params.id, req.body, req.user.id);
    res.status(200).json(successResponse('User updated', { user }));
  });

  /** Admin sets a user's password directly. POST /api/admin/users/:id/password */
  setUserPassword = catchAsync(async (req, res) => {
    const result = await adminService.setUserPassword(req.params.id, req.body.password, req.user.id);
    res.status(200).json(successResponse(result.message, {}));
  });

  /** Admin sends a password-reset link. POST /api/admin/users/:id/send-reset */
  sendUserPasswordReset = catchAsync(async (req, res) => {
    const result = await adminService.sendUserPasswordReset(req.params.id);
    res.status(200).json(successResponse(result.message, {}));
  });

  /** Admin disables/resets a user's 2FA. POST /api/admin/users/:id/disable-2fa */
  disableUserTwoFactor = catchAsync(async (req, res) => {
    const result = await adminService.disableUserTwoFactor(req.params.id, req.user.id);
    res.status(200).json(successResponse(result.message, {}));
  });

  /**
   * Update a user's platform capabilities (role views they may switch into).
   * The primary `role` is always preserved by the User model hook.
   * PATCH /api/admin/users/:id/capabilities
   * body: { capabilities: ['admin'|'mentor'|'mentee', ...] }
   */
  updateUserCapabilities = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { capabilities } = req.body;
    const valid = ['admin', 'mentor', 'mentee'];

    if (!Array.isArray(capabilities) || capabilities.some((c) => !valid.includes(c))) {
      return res.status(400).json({
        success: false,
        message: 'capabilities must be an array of admin/mentor/mentee',
        statusCode: 400
      });
    }

    const user = await models.User.findByPk(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found', statusCode: 404 });
    }

    // De-dupe; the beforeSave hook guarantees the primary role stays included.
    user.capabilities = [...new Set(capabilities)];
    await user.save();

    res.status(200).json(successResponse('Capabilities updated', {
      user: { id: user.id, role: user.role, capabilities: user.capabilities }
    }));
  });

  /**
   * Bulk create registration invites from a JSON array
   * POST /api/admin/invites/bulk
   */
  bulkRegistrationInvites = catchAsync(async (req, res) => {
    const { invites } = req.body;
    const report = await adminService.bulkCreateRegistrationInvites(invites, req.user.id);

    res.status(201).json(
      successResponse('Bulk invites processed successfully', { report }, 201)
    );
  });
}

module.exports = new AdminController();
