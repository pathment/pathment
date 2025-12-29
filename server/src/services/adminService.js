const bcrypt = require('bcrypt');
const { sequelize, models } = require('../db');
const { ConflictError, NotFoundError } = require('../utils/errors/errorTypes');
const { AUTH_MESSAGES, USER_MESSAGES } = require('../utils/responses/messages');

class AdminService {
  /**
   * Create a new admin user (only callable by existing admin)
   */
  async createAdmin(adminData, createdBy) {
    const { firstName, lastName, email, password, permissions } = adminData;

    // Check if email already exists
    const existingUser = await models.User.findOne({ where: { email } });
    if (existingUser) {
      throw new ConflictError(AUTH_MESSAGES.EMAIL_ALREADY_EXISTS);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create admin user
    const admin = await models.User.create({
      firstName,
      lastName,
      email,
      passwordHash: hashedPassword,
      role: 'admin',
      emailVerified: true,
      emailVerifiedAt: new Date(),
      status: 'active'
    });

    // Create admin profile
    await models.AdminProfile.create({
      userId: admin.id,
      permissions: permissions || ['view_analytics', 'manage_programs'],
      canManageUsers: permissions?.includes('manage_users') || false,
      canManagePrograms: permissions?.includes('manage_programs') || true,
      canManageContent: permissions?.includes('manage_content') || false,
      canViewAnalytics: permissions?.includes('view_analytics') || true,
      canManageSettings: permissions?.includes('manage_settings') || false
    });

    // Log admin creation
    await models.AuditLog.create({
      userId: createdBy,
      action: 'ADMIN_CREATED',
      entityType: 'User',
      entityId: admin.id,
      newValues: {
        email: admin.email,
        role: 'admin',
        permissions
      }
    });

    // Remove password from response
    const adminResponse = admin.toJSON();
    delete adminResponse.passwordHash;

    return adminResponse;
  }

  /**
   * Update admin permissions
   */
  async updateAdminPermissions(adminId, permissions, updatedBy) {
    const admin = await models.User.findOne({
      where: { id: adminId, role: 'admin' }
    });

    if (!admin) {
      throw new NotFoundError('Admin user not found');
    }

    const adminProfile = await models.AdminProfile.findOne({
      where: { userId: adminId }
    });

    const oldPermissions = adminProfile.permissions;

    // Update permissions
    await adminProfile.update({
      permissions,
      canManageUsers: permissions.includes('manage_users'),
      canManagePrograms: permissions.includes('manage_programs'),
      canManageContent: permissions.includes('manage_content'),
      canViewAnalytics: permissions.includes('view_analytics'),
      canManageSettings: permissions.includes('manage_settings')
    });

    // Log permission change
    await models.AuditLog.create({
      userId: updatedBy,
      action: 'ADMIN_PERMISSIONS_UPDATED',
      entityType: 'AdminProfile',
      entityId: adminProfile.id,
      oldValues: { permissions: oldPermissions },
      newValues: { permissions }
    });

    return adminProfile;
  }
}

module.exports = new AdminService();
