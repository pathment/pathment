const adminService = require('../services/adminService');
const { successResponse } = require('../utils/responses');
const { USER_MESSAGES } = require('../utils/responses/messages');
const { catchAsync } = require('../middlewares/errorHandler');

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
}

module.exports = new AdminController();
