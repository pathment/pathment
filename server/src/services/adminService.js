const bcrypt = require('bcrypt');
const { Op } = require('sequelize');
const { sequelize, models } = require('../db');
const { ConflictError, NotFoundError, ValidationError } = require('../utils/errors/errorTypes');
const { AUTH_MESSAGES, USER_MESSAGES } = require('../utils/responses/messages');
const { generateRandomToken, hashToken } = require('../utils/jwt');
const notificationOrchestrator = require('./notificationOrchestrator');
const inviteEmailQueue = require('../queues/inviteEmailQueue');

class AdminService {
  /**
   * Create one-time registration invite
   */
  async createRegistrationInvite(inviteData, createdBy) {
    const { email, role, expiresInHours = 72 } = inviteData;
    const normalizedEmail = email.trim().toLowerCase();
    const defaultInviteTtl = 72;
    const ttlHours = Math.max(1, Math.min(24 * 30, Number(expiresInHours) || defaultInviteTtl));
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    const existingUser = await models.User.findOne({ where: { email: normalizedEmail } });
    if (existingUser) {
      throw new ConflictError('User already exists for this email');
    }

    const existingActiveInvite = await models.RegistrationInvite.findOne({
      where: {
        email: normalizedEmail,
        role,
        usedAt: null,
        revokedAt: null,
        expiresAt: { [Op.gt]: new Date() }
      }
    });

    if (existingActiveInvite) {
      throw new ConflictError('An active invite already exists for this email and role');
    }

    const rawToken = generateRandomToken();
    const tokenHash = hashToken(rawToken);

    const invite = await models.RegistrationInvite.create({
      tokenHash,
      email: normalizedEmail,
      role,
      invitedBy: createdBy,
      expiresAt
    });

    await models.AuditLog.create({
      userId: createdBy,
      action: 'REGISTRATION_INVITE_CREATED',
      entityType: 'RegistrationInvite',
      entityId: invite.id,
      newValues: {
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt
      }
    });

    const clientBaseUrl = process.env.CLIENT_URL || 'http://localhost:3003';
    const inviteUrl = `${clientBaseUrl.replace(/\/$/, '')}/register?invite=${encodeURIComponent(rawToken)}`;

    const emailDelivery = await notificationOrchestrator.sendRegistrationInviteEmail({
      email: invite.email,
      role: invite.role,
      inviteUrl
    });

    if (!emailDelivery?.sent) {
      console.warn('registration invite email not sent:', emailDelivery?.reason || 'unknown_reason');
    }

    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
      inviteUrl,
      emailDelivery: {
        sent: Boolean(emailDelivery?.sent),
        reason: emailDelivery?.reason || null,
        id: emailDelivery?.id || null
      }
    };
  }

  /**
   * List registration invites with status filter
   */
  async listRegistrationInvites(filters = {}) {
    const { status = 'active', limit = 50, offset = 0 } = filters;
    const where = {};
    const now = new Date();

    if (status === 'active') {
      where.usedAt = null;
      where.revokedAt = null;
      where.expiresAt = { [Op.gt]: now };
    } else if (status === 'used') {
      where.usedAt = { [Op.not]: null };
    } else if (status === 'expired') {
      where.usedAt = null;
      where.revokedAt = null;
      where.expiresAt = { [Op.lte]: now };
    } else if (status === 'revoked') {
      where.revokedAt = { [Op.not]: null };
    }

    const parsedLimit = Math.min(100, Number(limit) || 50);
    const parsedOffset = Math.max(0, Number(offset) || 0);

    const { rows, count } = await models.RegistrationInvite.findAndCountAll({
      where,
      include: [
        { model: models.User, as: 'inviter', attributes: ['id', 'firstName', 'lastName', 'email'] },
        { model: models.User, as: 'usedByUser', attributes: ['id', 'firstName', 'lastName', 'email'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: parsedLimit,
      offset: parsedOffset
    });

    return {
      invites: rows,
      total: count,
      limit: parsedLimit,
      offset: parsedOffset
    };
  }

  /**
   * Revoke a registration invite
   */
  async revokeRegistrationInvite(inviteId, revokedBy) {
    const invite = await models.RegistrationInvite.findByPk(inviteId);
    if (!invite) {
      throw new NotFoundError('Registration invite not found');
    }

    if (invite.usedAt) {
      throw new ValidationError('Used invites cannot be revoked');
    }

    if (invite.revokedAt) {
      return invite;
    }

    invite.revokedAt = new Date();
    await invite.save();

    await models.AuditLog.create({
      userId: revokedBy,
      action: 'REGISTRATION_INVITE_REVOKED',
      entityType: 'RegistrationInvite',
      entityId: invite.id,
      newValues: {
        revokedAt: invite.revokedAt
      }
    });

    return invite;
  }

  /**
   * Create a new admin user (only callable by existing admin)
   */
  async createAdmin(adminData, createdBy) {
    const { firstName, lastName, email, password, permissions } = adminData;
    const normalizedEmail = email.trim().toLowerCase();

    // Check if email already exists
    const existingUser = await models.User.findOne({ where: { email: normalizedEmail } });
    if (existingUser) {
      throw new ConflictError(AUTH_MESSAGES.EMAIL_ALREADY_EXISTS);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create admin user
    const admin = await models.User.create({
      firstName,
      lastName,
      email: normalizedEmail,
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

    await models.UserSettings.create({ userId: admin.id });

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

    notificationOrchestrator.sendWelcomeEmail(admin).catch((error) => {
      console.warn('admin welcome email failed:', error.message);
    });

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
    try {
      // Execute all independent queries in parallel
      const [stats, recentPrograms, pendingMatches] = await Promise.all([
        this.#getBasicStats(),
        this.#getRecentProgramsWithStats(),
        this.#getPendingMatches()
      ]);

      return {
        stats,
        recentPrograms,
        pendingMatches
      };
    } catch (error) {
      throw new Error(`Failed to fetch dashboard stats: ${error.message}`);
    }
  }

  /**
   * Get basic dashboard statistics (programs, users, completion rate)
   */
  async #getBasicStats() {
    const PUBLISHED_STATUS = 'published';
    const ACTIVE_STATUSES = ['active', 'matched'];

    const [totalPrograms, activeMentees, activeMentors, completionResult] = await Promise.all([
      models.Program.count({ where: { status: PUBLISHED_STATUS } }),
      models.User.count({ where: { role: 'mentee', status: 'active' } }),
      models.User.count({ where: { role: 'mentor', status: 'active' } }),
      models.Enrollment.findOne({
        attributes: [
          [sequelize.fn('AVG', sequelize.col('overall_progress_percentage')), 'avgCompletion']
        ],
        where: { status: ACTIVE_STATUSES },
        raw: true
      })
    ]);

    const completionRate = this.#parsePercentage(completionResult?.avgCompletion);

    return {
      totalPrograms,
      activeMentees,
      activeMentors,
      completionRate
    };
  }

  /**
   * Get recent programs with stats
   */
  async #getRecentProgramsWithStats() {
    const PUBLISHED_STATUS = 'published';
    const EXCLUDED_STATUSES = ['rejected', 'dropped'];

    const recentPrograms = await models.Program.findAll({
      where: { status: PUBLISHED_STATUS },
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

    return Promise.all(
      recentPrograms.map(program => this.#enrichProgramWithStats(program, EXCLUDED_STATUSES))
    );
  }

  /**
   * Enrich program data with mentor and completion stats
   */
  async #enrichProgramWithStats(program, excludedStatuses) {
    const [mentorCount, avgResult] = await Promise.all([
      models.LevelMentorAssignment.count({
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
      }),
      models.Enrollment.findOne({
        attributes: [
          [sequelize.fn('AVG', sequelize.col('overall_progress_percentage')), 'avg']
        ],
        where: {
          programId: program.id,
          status: { [Op.notIn]: excludedStatuses }
        },
        raw: true
      })
    ]);

    const completion = this.#parsePercentage(avgResult?.avg);

    return {
      id: program.id,
      name: program.name,
      status: program.status,
      enrollments: program.enrollments?.length || 0,
      mentors: mentorCount,
      completion,
      startDate: program.startDate || program.createdAt
    };
  }

  /**
   * Get pending mentor matches
   */
  async #getPendingMatches() {
    const PENDING_STATUSES = ['approved', 'pending_match'];

    const pendingMatches = await models.Enrollment.findAll({
      where: { status: PENDING_STATUSES },
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

    return pendingMatches.map(enrollment => this.#formatPendingMatch(enrollment));
  }

  /**
   * Format pending match enrollment
   */
  #formatPendingMatch(enrollment) {
    return {
      id: enrollment.id,
      mentee: {
        id: enrollment.mentee.id,
        name: `${enrollment.mentee.firstName} ${enrollment.mentee.lastName}`,
        email: enrollment.mentee.email
      },
      program: enrollment.program.name,
      enrolledAt: enrollment.enrolledAt,
      waitTime: this.calculateWaitTime(enrollment.enrolledAt)
    };
  }

  /**
   * Parse and round percentage values
   */
  #parsePercentage(value) {
    return value ? Math.round(parseFloat(value)) : 0;
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

  /**
   * Suspend a user — sets status to 'suspended', immediately invalidates all sessions.
   */
  async suspendUser(targetUserId, adminUserId) {
    if (targetUserId === adminUserId) {
      throw new ValidationError('You cannot suspend your own account');
    }
    const user = await models.User.findByPk(targetUserId);
    if (!user) throw new NotFoundError('User not found');
    if (user.role === 'admin') throw new ValidationError('Admin accounts cannot be suspended through this endpoint');
    if (user.status === 'suspended') throw new ValidationError('User is already suspended');

    await user.update({ status: 'suspended' });
    // Invalidate all active sessions so they are kicked out immediately
    await models.UserSession.destroy({ where: { userId: targetUserId } });
    await models.RefreshToken.destroy({ where: { userId: targetUserId } });

    return { message: `${user.firstName} ${user.lastName} has been suspended` };
  }

  /**
   * Unsuspend a user — restores status to 'active'.
   */
  async unsuspendUser(targetUserId, adminUserId) {
    const user = await models.User.findByPk(targetUserId);
    if (!user) throw new NotFoundError('User not found');
    if (user.status !== 'suspended') throw new ValidationError('User is not suspended');

    await user.update({ status: 'active' });

    return { message: `${user.firstName} ${user.lastName} has been unsuspended` };
  }

  /**
   * Delete a user (mentee or mentor) and all their associated data. Admin-only.
   * An admin cannot delete themselves or another admin.
   */
  async deleteUser(targetUserId, adminUserId) {
    if (targetUserId === adminUserId) {
      throw new ValidationError('You cannot delete your own account');
    }

    const user = await models.User.findByPk(targetUserId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    if (user.role === 'admin') {
      throw new ValidationError('Admin accounts cannot be deleted through this endpoint');
    }

    // For mentees: cancel active matches + delete assigned tasks before destroying enrollment
    if (user.role === 'mentee') {
      const enrollments = await models.Enrollment.findAll({
        where: { menteeId: targetUserId },
        attributes: ['id'],
      });
      const enrollmentIds = enrollments.map((e) => e.id);

      if (enrollmentIds.length > 0) {
        await models.MentorMenteeMatch.update(
          { status: 'cancelled' },
          { where: { enrollmentId: enrollmentIds, status: 'active' } }
        );
        await models.AssignedTask.destroy({ where: { enrollmentId: enrollmentIds } });
      }
    }

    // For mentors: deactivate any active level assignments
    if (user.role === 'mentor') {
      await models.LevelMentorAssignment.update(
        { isActive: false },
        { where: { mentorId: targetUserId, isActive: true } }
      );
      // Cancel their active matches (mentees revert to pending_match)
      const activeMatches = await models.MentorMenteeMatch.findAll({
        where: { mentorId: targetUserId, status: 'active' },
        attributes: ['enrollmentId'],
      });
      if (activeMatches.length > 0) {
        const enrollmentIds = activeMatches.map((m) => m.enrollmentId);
        await models.MentorMenteeMatch.update(
          { status: 'cancelled' },
          { where: { mentorId: targetUserId, status: 'active' } }
        );
        await models.Enrollment.update(
          { status: 'pending_match' },
          { where: { id: enrollmentIds } }
        );
      }
    }

    await user.destroy();

    return { message: `${user.firstName} ${user.lastName} has been deleted` };
  }

  /**
   * Bulk create registration invites from a list of {email, role} objects.
   * Deduplicates against existing users and active invites, then bulk inserts.
   * Emails are dispatched asynchronously in the background.
   */
  async bulkCreateRegistrationInvites(inviteRows, createdBy) {
    const BATCH_SIZE = 500;
    const defaultTtlHours = Number(process.env.REGISTRATION_INVITE_EXPIRY_HOURS) || 72;
    const expiresAt = new Date(Date.now() + defaultTtlHours * 60 * 60 * 1000);
    const clientBaseUrl = (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');

    const normalized = inviteRows.map(row => ({
      email: row.email.trim().toLowerCase(),
      role: row.role.trim().toLowerCase()
    }));

    const allEmails = [...new Set(normalized.map(r => r.email))];

    const [existingUsers, existingInvites] = await Promise.all([
      models.User.findAll({
        where: { email: allEmails },
        attributes: ['email'],
        raw: true
      }),
      models.RegistrationInvite.findAll({
        where: {
          email: allEmails,
          usedAt: null,
          revokedAt: null,
          expiresAt: { [Op.gt]: new Date() }
        },
        attributes: ['email', 'role'],
        raw: true
      })
    ]);

    const registeredEmails = new Set(existingUsers.map(u => u.email));
    const activeInviteKeys = new Set(existingInvites.map(i => `${i.email}::${i.role}`));

    const successfulInvites = [];
    const skippedInvites = [];
    const seen = new Set();

    for (const row of normalized) {
      const dedupeKey = `${row.email}::${row.role}`;

      if (seen.has(dedupeKey)) {
        skippedInvites.push({ ...row, reason: 'Duplicate row in file' });
        continue;
      }
      seen.add(dedupeKey);

      if (registeredEmails.has(row.email)) {
        skippedInvites.push({ ...row, reason: 'Already registered' });
        continue;
      }

      if (activeInviteKeys.has(dedupeKey)) {
        skippedInvites.push({ ...row, reason: 'Active invite already exists' });
        continue;
      }

      successfulInvites.push(row);
    }

    const createdRecords = [];

    for (let i = 0; i < successfulInvites.length; i += BATCH_SIZE) {
      const batch = successfulInvites.slice(i, i + BATCH_SIZE);

      const records = batch.map(row => {
        const rawToken = generateRandomToken();
        const tokenHash = hashToken(rawToken);
        return {
          tokenHash,
          rawToken,
          email: row.email,
          role: row.role,
          invitedBy: createdBy,
          expiresAt
        };
      });

      const inserted = await models.RegistrationInvite.bulkCreate(
        records.map(({ rawToken, ...dbFields }) => dbFields),
        { returning: true }
      );

      inserted.forEach((record, idx) => {
        createdRecords.push({
          id: record.id,
          email: record.email,
          role: record.role,
          rawToken: records[idx].rawToken
        });
      });
    }

    if (createdRecords.length > 0) {
      await models.AuditLog.create({
        userId: createdBy,
        action: 'BULK_REGISTRATION_INVITES_CREATED',
        entityType: 'RegistrationInvite',
        entityId: createdRecords[0].id,
        newValues: {
          totalCreated: createdRecords.length,
          totalSkipped: skippedInvites.length
        }
      });
    }

    // Enqueue each invite email as a separate Bull job (Upstash Redis-backed).
    // Bull retries failed jobs automatically; the queue is processed by inviteEmailWorker.
    if (createdRecords.length > 0) {
      const jobs = createdRecords.map(r => ({
        data: { email: r.email, role: r.role, rawToken: r.rawToken, clientBaseUrl },
      }));
      inviteEmailQueue.addBulk(jobs).catch(err =>
        console.error('[bulk-invite:queue-error]', err.message)
      );
    }

    return {
      successCount: createdRecords.length,
      skippedCount: skippedInvites.length,
      totalProcessed: normalized.length,
      successfulInvites: createdRecords.map(r => ({ email: r.email, role: r.role })),
      skippedInvites
    };
  }
}

module.exports = new AdminService();

