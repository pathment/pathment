const bcrypt = require('bcrypt');
const { Op } = require('sequelize');
const { sequelize, models } = require('../db');
const { ConflictError, NotFoundError, ValidationError } = require('../utils/errors/errorTypes');
const { AUTH_MESSAGES, USER_MESSAGES } = require('../utils/responses/messages');
const { generateRandomToken, hashToken } = require('../utils/jwt');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const { createAuditLog } = require('../utils/auditContext');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class AdminService {
  /**
   * Resolve an invite's program/clan placement from ids OR names (CSV passes
   * names, the UI passes ids). The invite is the single source of truth for
   * where a registrant lands, so this validates strictly per role:
   *   - mentee → program required; clan optional (must belong to the program)
   *   - mentor → clan required; program is derived from the clan
   * Returns { programId, clanId, programName, clanName }.
   */
  async _resolveInvitePlacement({ role, program, clan }) {
    const lookup = async (model, value, label) => {
      const key = value == null ? '' : String(value).trim();
      if (!key) return null;
      const row = UUID_RE.test(key)
        ? await model.findByPk(key)
        : await model.findOne({ where: { name: key } });
      if (!row) throw new ValidationError(`${label} not found: ${key}`);
      return row;
    };

    const clanRow = await lookup(models.Clan, clan, 'Clan');
    const programRow = await lookup(models.Program, program, 'Program');

    if (role === 'mentee') {
      if (!programRow) throw new ValidationError('A program is required when inviting a mentee');
      if (clanRow && clanRow.programId !== programRow.id) {
        throw new ValidationError('The selected clan does not belong to the selected program');
      }
      return {
        programId: programRow.id,
        clanId: clanRow ? clanRow.id : null,
        programName: programRow.name,
        clanName: clanRow ? clanRow.name : null
      };
    }

    // mentor - placement is the clan they'll lead; program comes from the clan.
    if (!clanRow) throw new ValidationError('A clan is required when inviting a mentor');
    if (programRow && programRow.id !== clanRow.programId) {
      throw new ValidationError("The selected program does not match the clan's program");
    }
    const clanProgram = programRow || await models.Program.findByPk(clanRow.programId);
    return {
      programId: clanRow.programId,
      clanId: clanRow.id,
      programName: clanProgram ? clanProgram.name : null,
      clanName: clanRow.name
    };
  }

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

    const placement = await this._resolveInvitePlacement({
      role,
      program: inviteData.programId ?? inviteData.program,
      clan: inviteData.clanId ?? inviteData.clan
    });

    const rawToken = generateRandomToken();
    const tokenHash = hashToken(rawToken);

    const invite = await models.RegistrationInvite.create({
      tokenHash,
      email: normalizedEmail,
      role,
      invitedBy: createdBy,
      expiresAt,
      programId: placement.programId,
      clanId: placement.clanId,
      // Set when the invite is issued from an accepted application.
      cohortId: inviteData.cohortId || null
    });

    await createAuditLog({
      userId: createdBy,
      action: 'REGISTRATION_INVITE_CREATED',
      entityType: 'RegistrationInvite',
      entityId: invite.id,
      newValues: {
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt,
        programId: invite.programId,
        clanId: invite.clanId
      }
    });

    const clientBaseUrl = process.env.CLIENT_URL || 'http://localhost:3003';
    const inviteUrl = `${clientBaseUrl.replace(/\/$/, '')}/register?invite=${encodeURIComponent(rawToken)}`;

    const emailDelivery = await notificationOrchestrator.sendRegistrationInviteEmail({
      email: invite.email,
      role: invite.role,
      inviteUrl
    });

    if (!emailDelivery?.queued && !emailDelivery?.sent && !emailDelivery?.deduped) {
      console.warn('registration invite email not enqueued:', emailDelivery?.reason || 'unknown_reason');
    }

    // Give the clan's mentors a heads-up that a new mentee is being onboarded into
    // their clan (they get a second "joined" notification once the mentee registers).
    if (role === 'mentee' && placement.clanId) {
      this._notifyClanMentorsOfInvitedMentee({
        clanId: placement.clanId,
        clanName: placement.clanName,
        email: normalizedEmail,
        inviteId: invite.id
      }).catch((e) => console.warn('invited-mentee notify failed:', e.message));
    }

    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
      programId: invite.programId,
      clanId: invite.clanId,
      programName: placement.programName,
      clanName: placement.clanName,
      inviteUrl,
      emailDelivery: {
        sent: Boolean(emailDelivery?.sent),
        reason: emailDelivery?.reason || null,
        id: emailDelivery?.id || null
      }
    };
  }

  /** Heads-up to a clan's mentors (lead + co) that a mentee has been invited to their clan. */
  async _notifyClanMentorsOfInvitedMentee({ clanId, clanName, email, inviteId }) {
    const mentors = await models.ClanMembership.findAll({
      where: { clanId, role: ['lead_mentor', 'co_mentor'], status: 'active' },
      attributes: ['userId']
    });
    const recipientIds = [...new Set(mentors.map((m) => m.userId).filter(Boolean))];
    if (recipientIds.length === 0) return;

    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.NEW_MENTEE_IN_CLAN,
      recipients: recipientIds.map((userId) => ({ userId })),
      payload: {
        title: 'New mentee invited to your clan',
        message: `${email} has been invited to join your clan "${clanName || 'your clan'}". You'll be notified again once they register.`,
        actionUrl: '/mentor/clan-team',
        actionLabel: 'Open Clan Team',
        relatedEntityType: 'mentee_invited',
        relatedEntityId: inviteId
      },
      // In-app only at invite time; the "joined" email follows on registration.
      channelOverrides: { email: false },
      dedupe: { relatedEntityType: 'mentee_invited', relatedEntityId: inviteId }
    });
  }

  /**
   * List registration invites with status filter
   */
  async listRegistrationInvites(filters = {}) {
    const { status = 'active', limit = 50, offset = 0, programIds, programId, clanId, search } = filters;
    const where = {};
    const now = new Date();

    // A program_admin sees only their programs' invites (org admins: all).
    if (Array.isArray(programIds)) where.programId = { [Op.in]: programIds };

    // Explicit program filter — but never widen a program_admin's scope: an
    // out-of-scope programId yields no rows rather than leaking other programs.
    if (programId) {
      if (Array.isArray(programIds) && !programIds.includes(programId)) {
        where.programId = '00000000-0000-0000-0000-000000000000';
      } else {
        where.programId = programId;
      }
    }
    if (clanId) where.clanId = clanId;
    if (search) where.email = { [Op.iLike]: `%${search}%` };

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
        { model: models.User, as: 'usedByUser', attributes: ['id', 'firstName', 'lastName', 'email'] },
        { model: models.Program, as: 'program', attributes: ['id', 'name'] },
        { model: models.Clan, as: 'clan', attributes: ['id', 'name'] }
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

    await createAuditLog({
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
    await createAuditLog({
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
    await createAuditLog({
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
      // Distinct mentors with an active match in this program (level-mentor
      // assignment was removed; mentor↔program is via matches now).
      models.MentorMenteeMatch.count({
        distinct: true,
        col: 'mentor_id',
        where: { status: 'active' },
        include: [{
          model: models.Enrollment,
          as: 'enrollment',
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
   * Suspend a user - sets status to 'suspended', immediately invalidates all sessions.
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
   * Unsuspend a user - restores status to 'active'.
   */
  async unsuspendUser(targetUserId, adminUserId) {
    const user = await models.User.findByPk(targetUserId);
    if (!user) throw new NotFoundError('User not found');
    if (user.status !== 'suspended') throw new ValidationError('User is not suspended');

    await user.update({ status: 'active' });

    return { message: `${user.firstName} ${user.lastName} has been unsuspended` };
  }

  /**
   * Admin edits a user's profile: name, email, and base role (mentee↔mentor).
   * Email changes are trusted (kept verified). Base-role changes only apply to
   * mentee/mentor accounts (admin accounts aren't demoted here), and the
   * beforeSave hook keeps `capabilities` in sync. Returns the updated public user.
   */
  async updateUser(targetUserId, updates = {}, adminUserId = null) {
    const user = await models.User.findByPk(targetUserId);
    if (!user) throw new NotFoundError('User not found');

    const before = { firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role };

    if (updates.firstName !== undefined) user.firstName = String(updates.firstName).trim().slice(0, 100);
    if (updates.lastName !== undefined) user.lastName = String(updates.lastName).trim().slice(0, 100);

    if (updates.email !== undefined && updates.email && updates.email.trim().toLowerCase() !== user.email) {
      const email = updates.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ValidationError('Enter a valid email address');
      const clash = await models.User.findOne({ where: { email, id: { [Op.ne]: user.id } }, attributes: ['id'] });
      if (clash) throw new ConflictError('That email is already in use by another account');
      user.email = email;
      // Admin-set email is trusted → keep it usable immediately.
      user.emailVerified = true;
      user.emailVerifiedAt = new Date();
    }

    if (updates.role !== undefined && updates.role !== user.role) {
      if (!['mentee', 'mentor'].includes(updates.role)) {
        throw new ValidationError('Base role must be mentee or mentor');
      }
      if (user.role === 'admin') {
        throw new ValidationError('Admin accounts cannot be re-roled here — manage them in Roles & Access');
      }
      user.role = updates.role; // beforeSave hook adds it to capabilities
    }

    await user.save();

    await createAuditLog({
      userId: adminUserId, action: 'USER_UPDATED_BY_ADMIN', entityType: 'User', entityId: user.id,
      oldValues: before, newValues: { firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role },
    }).catch(() => {});

    return {
      id: user.id, firstName: user.firstName, lastName: user.lastName,
      email: user.email, role: user.role, status: user.status, capabilities: user.capabilities,
    };
  }

  /**
   * Admin sets a user's password directly (e.g. "they can't log in" support).
   * Logs them out of all sessions so the new password takes effect everywhere.
   */
  async setUserPassword(targetUserId, newPassword, adminUserId = null) {
    if (!newPassword || String(newPassword).length < 8) {
      throw new ValidationError('Password must be at least 8 characters');
    }
    const user = await models.User.findByPk(targetUserId);
    if (!user) throw new NotFoundError('User not found');

    user.passwordHash = await bcrypt.hash(String(newPassword), 12);
    await user.save();
    await models.UserSession.destroy({ where: { userId: user.id } });
    await models.RefreshToken.destroy({ where: { userId: user.id } });

    await createAuditLog({
      userId: adminUserId, action: 'USER_PASSWORD_SET_BY_ADMIN', entityType: 'User', entityId: user.id,
    }).catch(() => {});

    return { message: `Password updated for ${user.firstName} ${user.lastName}. They've been signed out.` };
  }

  /** Admin triggers the normal "forgot password" reset email for a user. */
  async sendUserPasswordReset(targetUserId) {
    const user = await models.User.findByPk(targetUserId, { attributes: ['id', 'email', 'firstName', 'lastName'] });
    if (!user) throw new NotFoundError('User not found');
    const authService = require('./authService');
    await authService.forgotPassword(user.email);
    return { message: `A password-reset link was sent to ${user.email}` };
  }

  /**
   * Admin disables/resets a user's 2FA (e.g. they lost their authenticator and
   * are locked out). Idempotent. NOTE: an admin can't ENABLE 2FA for someone —
   * enrolment needs the user's own authenticator app; they re-enable it in Settings.
   */
  async disableUserTwoFactor(targetUserId, adminUserId = null) {
    const user = await models.User.findByPk(targetUserId, { attributes: ['id', 'firstName', 'lastName', 'twoFactorEnabled'] });
    if (!user) throw new NotFoundError('User not found');
    if (!user.twoFactorEnabled) return { message: 'Two-factor was already off for this user.' };

    const securityService = require('./securityService');
    await securityService.disable2FA(targetUserId);
    await createAuditLog({
      userId: adminUserId, action: 'USER_2FA_DISABLED_BY_ADMIN', entityType: 'User', entityId: targetUserId,
    }).catch(() => {});
    return { message: `Two-factor disabled for ${user.firstName} ${user.lastName}. They can log in without a code and re-enable it in Settings.` };
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

    // For mentors: cancel their active matches (mentees revert to pending_match).
    if (user.role === 'mentor') {
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
      role: row.role.trim().toLowerCase(),
      program: row.programId ?? row.program ?? null,
      clan: row.clanId ?? row.clan ?? null
    }));

    // Memoize placement resolution - CSVs repeat the same program/clan often.
    const placementCache = new Map();
    const resolvePlacement = async ({ role, program, clan }) => {
      const key = `${role}|${program || ''}|${clan || ''}`;
      if (placementCache.has(key)) return placementCache.get(key);
      const result = await this._resolveInvitePlacement({ role, program, clan });
      placementCache.set(key, result);
      return result;
    };

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

      // The invite is the placement - resolve/validate program+clan per role.
      let placement;
      try {
        placement = await resolvePlacement({ role: row.role, program: row.program, clan: row.clan });
      } catch (e) {
        skippedInvites.push({ ...row, reason: e.message });
        continue;
      }

      successfulInvites.push({ ...row, programId: placement.programId, clanId: placement.clanId });
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
          expiresAt,
          programId: row.programId,
          clanId: row.clanId
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
      await createAuditLog({
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

    // Enqueue each invite onto the DB-backed email queue (idempotent per token).
    // The email worker delivers + retries; no Redis involved.
    if (createdRecords.length > 0) {
      Promise.allSettled(createdRecords.map((r) => {
        const inviteUrl = `${clientBaseUrl}/register?invite=${encodeURIComponent(r.rawToken)}`;
        return notificationOrchestrator.sendRegistrationInviteEmail({ email: r.email, role: r.role, inviteUrl });
      })).catch((err) => console.error('[bulk-invite:enqueue-error]', err.message));
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

