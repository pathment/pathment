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

  /**
   * Get dashboard statistics for admin
   */
  async getDashboardStats() {
    // Get total programs count
    const totalPrograms = await models.Program.count({
      where: { status: 'published' }
    });

    // Get active mentees count (enrolled and active status)
    const activeMentees = await models.User.count({
      where: { 
        role: 'mentee',
        status: 'active'
      }
    });

    // Get active mentors count
    const activeMentors = await models.User.count({
      where: { 
        role: 'mentor',
        status: 'active'
      }
    });

    // Get completion rate (average of all active enrollments)
    const completionResult = await models.Enrollment.findOne({
      attributes: [
        [sequelize.fn('AVG', sequelize.col('overall_progress_percentage')), 'avgCompletion']
      ],
      where: {
        status: ['active', 'matched']
      },
      raw: true
    });

    const completionRate = completionResult?.avgCompletion 
      ? Math.round(parseFloat(completionResult.avgCompletion))
      : 0;

    // Get recent programs (top 4 active programs)
    const recentPrograms = await models.Program.findAll({
      where: { status: 'published' },
      include: [
        {
          model: models.Enrollment,
          as: 'enrollments',
          attributes: ['id'],
          required: false
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: 4
    });

    // Format programs with mentor counts
    const programsWithStats = await Promise.all(
      recentPrograms.map(async (program) => {
        const mentorCount = await models.LevelMentorAssignment.count({
          distinct: true,
          col: 'mentor_id',
          where: { isActive: true },
          include: [{
            model: models.ProgramLevel,
            as: 'level',
            where: { programId: program.id },
            attributes: [],
            required: true
          }]
        });

        return {
          id: program.id,
          name: program.name,
          status: program.status,
          enrollments: program.enrollments?.length || 0,
          mentors: mentorCount,
          completion: 0, // TODO: Calculate per program
          startDate: program.startDate || program.createdAt
        };
      })
    );

    // Get pending mentor matches (approved enrollments without mentor assignment)
    const pendingMatches = await models.Enrollment.findAll({
      where: {
        status: ['approved', 'pending_match']
      },
      include: [
        {
          model: models.User,
          as: 'mentee',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: models.Program,
          as: 'program',
          attributes: ['id', 'name']
        }
      ],
      order: [['enrolledAt', 'ASC']],
      limit: 5
    });

    const formattedPendingMatches = pendingMatches.map(enrollment => ({
      id: enrollment.id,
      mentee: {
        id: enrollment.mentee.id,
        name: `${enrollment.mentee.firstName} ${enrollment.mentee.lastName}`,
        email: enrollment.mentee.email
      },
      program: enrollment.program.name,
      enrolledAt: enrollment.enrolledAt,
      waitTime: this.calculateWaitTime(enrollment.enrolledAt)
    }));

    return {
      stats: {
        totalPrograms,
        activeMentees,
        activeMentors,
        completionRate
      },
      recentPrograms: programsWithStats,
      pendingMatches: formattedPendingMatches
    };
  }

  /**
   * Helper to calculate wait time
   */
  calculateWaitTime(enrolledAt) {
    const now = new Date();
    const enrolled = new Date(enrolledAt);
    const diffMs = now - enrolled;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''}`;
    } else if (diffHours > 0) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''}`;
    } else {
      return 'Just now';
    }
  }
}

module.exports = new AdminService();

