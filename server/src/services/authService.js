const bcrypt = require('bcrypt');
const { Op } = require('sequelize');
const { sequelize, models } = require('../db');
const { 
  AuthenticationError, 
  ConflictError, 
  NotFoundError,
  ValidationError 
} = require('../utils/errors/errorTypes');
const { AUTH_MESSAGES } = require('../utils/responses/messages');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  generateRandomToken,
  hashToken
} = require('../utils/jwt');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const { mapResponsesToProfile } = require('../config/intakeProfileFields');
const logger = require('../utils/logger');

/**
 * How long after rotation a spent refresh token is still treated as a retry
 * rather than a replay.
 *
 * Two honest clients can present the same token at once — a page firing several
 * requests at expiry, or a phone resuming from background. Below this window we
 * assume the race; above it we assume theft and end every session. 60s is well
 * past any real retry and far short of anything useful to an attacker.
 */
const REUSE_GRACE_MS = 60 * 1000;

class AuthService {
  async getActiveInviteByToken(inviteToken, transaction) {
    const tokenHash = hashToken(inviteToken);
    const invite = await models.RegistrationInvite.findOne({
      where: { tokenHash },
      transaction
    });

    if (!invite) {
      throw new ValidationError('Invalid invite token');
    }

    if (invite.revokedAt) {
      throw new ValidationError('This invite has been revoked');
    }

    if (invite.usedAt) {
      throw new ValidationError('This invite has already been used');
    }

    if (new Date(invite.expiresAt) <= new Date()) {
      throw new ValidationError('This invite has expired');
    }

    return invite;
  }

  async getRegistrationInviteDetails(inviteToken) {
    if (!inviteToken) {
      throw new ValidationError('Invite token is required');
    }

    const invite = await this.getActiveInviteByToken(inviteToken);

    // Surface the placement so the registration page can show (read-only)
    // which program/clan the person is joining.
    const [program, clan, application] = await Promise.all([
      invite.programId ? models.Program.findByPk(invite.programId, { attributes: ['id', 'name'] }) : null,
      invite.clanId ? models.Clan.findByPk(invite.clanId, { attributes: ['id', 'name'] }) : null,
      // If this invite came from an application, prefill the registrant's name
      // so they don't re-type what they already gave at intake.
      models.Application.findOne({ where: { inviteId: invite.id }, attributes: ['firstName', 'lastName'] })
    ]);

    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
      program: program ? { id: program.id, name: program.name } : null,
      clan: clan ? { id: clan.id, name: clan.name } : null,
      applicant: application ? { firstName: application.firstName || '', lastName: application.lastName || '' } : null
    };
  }

  /**
   * Register a new user
   */
  async register(userData) {
    const {
      firstName,
      lastName,
      email,
      password,
      inviteToken,
      phoneNumber,
      dateOfBirth,
      bio
    } = userData;

    if (!inviteToken) {
      throw new ValidationError('Invite token is required');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const hashedPassword = await bcrypt.hash(password, 12);

    // Captured inside the txn so we can notify the clan's mentors after commit.
    let placedMenteeClan = null; // { id, name } when a mentee is placed into a clan

    const result = await sequelize.transaction(async (transaction) => {
      const invite = await this.getActiveInviteByToken(inviteToken, transaction);

      if (invite.email.toLowerCase() !== normalizedEmail) {
        throw new ValidationError('This invite is only valid for a specific email address');
      }

      const role = invite.role;

      // Check if email already exists
      const existingUser = await models.User.findOne({ where: { email: normalizedEmail }, transaction });
      if (existingUser) {
        throw new ConflictError(AUTH_MESSAGES.EMAIL_ALREADY_EXISTS);
      }

      // Carry forward whatever the applicant already gave at intake - so they
      // never re-type it. Map the linked application's answers onto the user +
      // mentee profile, and skip the onboarding steps they've effectively done.
      const application = await models.Application.findOne({ where: { inviteId: invite.id }, transaction });
      const { userPatch, profilePatch } = application
        ? mapResponsesToProfile(application.responses)
        : { userPatch: {}, profilePatch: {} };
      // The mentee-profile step is satisfied once we have any of the core fields.
      const coreProfileKnown = ['currentEducation', 'currentOccupation', 'learningGoals', 'interests']
        .some((k) => profilePatch[k] != null && (!Array.isArray(profilePatch[k]) || profilePatch[k].length));

      const user = await models.User.create({
        firstName: firstName || application?.firstName || null,
        lastName: lastName || application?.lastName || null,
        email: normalizedEmail,
        passwordHash: hashedPassword,
        role,
        phoneNumber,
        dateOfBirth,
        // Pre-fill location/contact collected at intake (explicit form input wins).
        ...userPatch,
        // Skip the profile step of onboarding when intake already captured it.
        onboardingStep: role === 'mentee' && coreProfileKnown ? 1 : 0,
        // Email is already proven valid - invite was sent to this exact address
        emailVerified: true,
        emailVerifiedAt: new Date(),
        status: 'active'
      }, { transaction });

      if (role === 'mentor') {
        await models.MentorProfile.create({
          userId: user.id,
          bio: bio || null,
          specialization: [],
          yearsOfExperience: 0,
          maxMentees: 5
        }, { transaction });
      } else {
        await models.MenteeProfile.create({
          userId: user.id,
          interests: [],
          currentEducation: null,
          currentOccupation: null,
          priorExperience: null,
          preferredLearningStyle: 'visual',
          learningGoals: [],
          currentLevel: 1,
          totalPoints: 0,
          // Overlay anything the applicant already provided at intake.
          ...profilePatch
        }, { transaction });
      }

      await models.UserSettings.create({ userId: user.id }, { transaction });

      // The invite is the placement - enroll/place strictly from the token,
      // never from anything the registrant sent. Stale placement (program/clan
      // deleted after the invite was issued) degrades gracefully.
      if (role === 'mentee' && invite.programId) {
        const program = await models.Program.findByPk(invite.programId, { transaction });
        if (program) {
          await models.Enrollment.create({
            menteeId: user.id,
            programId: invite.programId,
            // Trace the enrollment back to its intake cohort, when present.
            cohortId: invite.cohortId || null,
            // Placed into a clan on the same invite ⇒ already matched.
            status: invite.clanId ? 'active' : 'pending_match',
            enrolledAt: new Date()
          }, { transaction });
        }
      }

      if (invite.clanId) {
        const clan = await models.Clan.findByPk(invite.clanId, { transaction });
        if (clan) {
          let membershipRole = 'mentee';
          if (role === 'mentor') {
            // First mentor on the clan becomes its lead; later ones co-mentor.
            if (!clan.leadMentorId) {
              membershipRole = 'lead_mentor';
              clan.leadMentorId = user.id;
              await clan.save({ transaction });
            } else {
              membershipRole = 'co_mentor';
            }
          }
          await models.ClanMembership.create({
            clanId: clan.id,
            userId: user.id,
            role: membershipRole,
            status: 'active'
          }, { transaction });

          if (membershipRole === 'mentee') {
            placedMenteeClan = { id: clan.id, name: clan.name };
          }
        }
      }

      // Apply any pre-assigned role grants carried on the invite (e.g. an
      // "invite with access" that makes the new account a program_admin).
      const pendingGrants = Array.isArray(invite.metadata?.pendingGrants) ? invite.metadata.pendingGrants : [];
      for (const g of pendingGrants) {
        if (!g || !g.role) continue;
        await models.RoleAssignment.create({
          userId: user.id,
          role: g.role,
          scopeType: g.scopeType || 'org',
          scopeId: g.scopeId || null,
          grantedBy: invite.invitedBy
        }, { transaction }).catch(() => {});
      }

      // Link the originating application (if this invite came from intake).
      await models.Application.update(
        { userId: user.id },
        { where: { inviteId: invite.id }, transaction }
      );

      invite.usedAt = new Date();
      invite.usedBy = user.id;
      await invite.save({ transaction });

      return { user };
    });

    notificationOrchestrator.sendWelcomeEmail(result.user).catch((error) => {
      console.warn('welcome email failed:', error.message);
    });

    // Tell the clan's mentors a new mentee actually joined their clan.
    if (placedMenteeClan) {
      this._notifyClanMentorsOfNewMentee({ clan: placedMenteeClan, mentee: result.user }).catch((e) =>
        console.warn('new-mentee notify failed:', e.message)
      );
    }

    const userResponse = result.user.toJSON();
    delete userResponse.passwordHash;

    return { user: userResponse };
  }

  /** Notify a clan's mentors (lead + co) that a new mentee has joined their clan. */
  async _notifyClanMentorsOfNewMentee({ clan, mentee }) {
    const mentors = await models.ClanMembership.findAll({
      where: { clanId: clan.id, role: ['lead_mentor', 'co_mentor'], status: 'active' },
      attributes: ['userId']
    });
    const recipientIds = [...new Set(mentors.map((m) => m.userId).filter((id) => id && id !== mentee.id))];
    if (recipientIds.length === 0) return;

    const menteeName = `${mentee.firstName || ''} ${mentee.lastName || ''}`.trim() || mentee.email;
    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.NEW_MENTEE_IN_CLAN,
      recipients: recipientIds.map((userId) => ({ userId })),
      payload: {
        title: 'New mentee in your clan',
        message: `${menteeName} has joined your clan "${clan.name}".`,
        actionUrl: '/mentor/mentees',
        actionLabel: 'View mentees',
        relatedEntityType: 'new_mentee',
        relatedEntityId: mentee.id,
        emailSubject: `Pathment: ${menteeName} joined your clan`
      }
      // Dedupe falls back to the payload (new_mentee + mentee.id), which is a real UUID.
    });
  }

  /**
   * Login user
   */
  async login(email, password, rememberMe = false, client = 'web') {
    const normalizedEmail = email.trim().toLowerCase();

    // Find user
    const user = await models.User.findOne({ 
      where: { email: normalizedEmail },
      include: [
        { model: models.MentorProfile, as: 'mentorProfile' },
        { model: models.MenteeProfile, as: 'menteeProfile' },
        { model: models.AdminProfile, as: 'adminProfile' }
      ]
    });

    if (!user) {
      throw new AuthenticationError(AUTH_MESSAGES.INVALID_CREDENTIALS);
    }

    // Check if account is active
    if (user.status !== 'active') {
      throw new AuthenticationError(AUTH_MESSAGES.ACCOUNT_DISABLED);
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new AuthenticationError(AUTH_MESSAGES.INVALID_CREDENTIALS);
    }

    if (!user.emailVerified) {
      throw new AuthenticationError(AUTH_MESSAGES.EMAIL_NOT_VERIFIED);
    }

    // Check if 2FA is enabled
    if (user.twoFactorEnabled) {
      // Generate temporary token for 2FA verification
      const temporaryToken = generateAccessToken({ 
        id: user.id, 
        email: user.email, 
        role: user.role,
        temp: true 
      }, '5m'); // 5 minute expiry for 2FA verification

      // Remove password from response
      const userResponse = user.toJSON();
      delete userResponse.passwordHash;

      return {
        requiresTwoFactor: true,
        temporaryToken,
        user: userResponse
      };
    }

    // Update last login
    user.lastLoginAt = new Date();
    await user.save();

    // Generate tokens
    const accessToken = generateAccessToken({ 
      id: user.id, 
      email: user.email, 
      role: user.role 
    });
    // "Remember me" drives the session length: 30 days when checked, otherwise a
    // short 1-day session (the client also holds these tokens in session storage
    // so they vanish when the browser closes).
    const { refreshToken } = await this._issueRefreshToken(user, { rememberMe, client });

    // Remove password from response
    const userResponse = user.toJSON();
    delete userResponse.passwordHash;

    // Derive live capabilities + permissions so the client lands with the right
    // switcher/areas without a second round-trip.
    const authzService = require('./authzService');
    const assignments = await authzService.getAssignments(user);
    userResponse.capabilities = await authzService.getCapabilities(user, { assignments });
    userResponse.permissions = await authzService.getPermissionUnion(user);
    userResponse.canAccessAdmin = await authzService.hasAdminAccess(user, { assignments });

    return {
      user: userResponse,
      accessToken,
      refreshToken
    };
  }

  /**
   * Refresh access token, ROTATING the refresh token as we go.
   *
   * Every exchange spends the presented token and issues a successor, so a
   * refresh token is valid exactly once. That turns a stolen token from a
   * long-lived master key into a single-use one, and — because the legitimate
   * device will inevitably present the same token afterwards — makes the theft
   * detectable rather than silent.
   *
   * The successor inherits the ORIGINAL expiry, so rotating does not extend a
   * session indefinitely: a 1-day session still ends after a day.
   *
   * Three cases, in order:
   *   1. active token      → rotate and return a new pair
   *   2. rotated recently  → benign retry, hand back the same successor
   *   3. rotated long ago  → replay of a spent token; revoke the whole family
   *      (see REUSE_GRACE_MS for where the line sits)
   */
  async refreshAccessToken(refreshToken) {
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch (error) {
      throw new AuthenticationError(AUTH_MESSAGES.INVALID_TOKEN);
    }

    // Check the account BEFORE spending the token: a disabled user should be
    // turned away without their session being rotated underneath them.
    const user = await this._activeUserOrThrow(decoded.id);

    // The lookup and the rotation happen together, under a row lock, so two
    // refreshes arriving at once are serialised: the first rotates, the second
    // sees an already-revoked row and takes the retry path. Without the lock
    // both would pass the "is active" check and each mint a successor, leaving
    // a live refresh token nobody is tracking.
    const outcome = await sequelize.transaction(async (transaction) => {
      // Deliberately NOT filtered on revokedAt — a revoked row is not merely
      // "invalid", it is the signal that something replayed a spent token.
      const row = await models.RefreshToken.findOne({
        where: { token: refreshToken, userId: decoded.id },
        lock: transaction.LOCK.UPDATE,
        transaction
      });

      if (!row) return { kind: 'unknown' };
      if (row.revokedAt) return { kind: 'spent', row };
      if (new Date(row.expiresAt) <= new Date()) return { kind: 'expired' };

      // The successor inherits the ORIGINAL expiry, so rotating does not extend
      // a session for ever: a 1-day session still ends after a day.
      const remainingMs = new Date(row.expiresAt).getTime() - Date.now();
      const successor = generateRefreshToken(
        { id: user.id },
        `${Math.max(1, Math.floor(remainingMs / 1000))}s`
      );

      await models.RefreshToken.create({
        userId: user.id,
        token: successor,
        expiresAt: row.expiresAt,
        client: row.client,
        lastUsedAt: new Date()
      }, { transaction });

      await row.update({
        revokedAt: new Date(),
        revokedReason: 'rotated',
        replacedByToken: successor,
        lastUsedAt: new Date()
      }, { transaction });

      return { kind: 'rotated', token: successor, expiresAt: row.expiresAt };
    });

    if (outcome.kind === 'rotated') {
      return {
        accessToken: generateAccessToken({ id: user.id, email: user.email, role: user.role }),
        refreshToken: outcome.token,
        expiresAt: outcome.expiresAt
      };
    }

    if (outcome.kind === 'spent') {
      const { row } = outcome;
      const rotatedAgo = Date.now() - new Date(row.revokedAt).getTime();
      const isBenignRetry =
        row.revokedReason === 'rotated' &&
        row.replacedByToken &&
        rotatedAgo <= REUSE_GRACE_MS;

      if (isBenignRetry) {
        // Two in-flight refreshes from the same device, or a request retried
        // after a dropped response. Answer the loser with the winner's token
        // rather than signing a real person out over a race.
        const successor = await models.RefreshToken.findOne({
          where: { token: row.replacedByToken, revokedAt: null }
        });
        if (successor) {
          return {
            accessToken: generateAccessToken({ id: user.id, email: user.email, role: user.role }),
            refreshToken: successor.token,
            expiresAt: successor.expiresAt
          };
        }
      }

      // A spent token presented outside the retry window. We cannot tell the
      // thief from the victim, so we end every session and make them sign in
      // again — the only response that reliably locks an attacker out.
      await models.RefreshToken.update(
        { revokedAt: new Date(), revokedReason: 'reuse_detected' },
        { where: { userId: user.id, revokedAt: null } }
      );
      logger.warn('Refresh token reuse detected; revoked all sessions', {
        userId: user.id,
        rotatedAgoMs: rotatedAgo,
        previousReason: row.revokedReason
      });
      throw new AuthenticationError(AUTH_MESSAGES.INVALID_TOKEN);
    }

    throw new AuthenticationError(AUTH_MESSAGES.INVALID_TOKEN);
  }

  /**
   * Mint and persist a refresh token for a fresh sign-in.
   *
   * One place for the session-length rule, because login and the 2FA completion
   * path both need it and had drifted into two copies.
   *
   * A native client always gets the long session: there is no "close the browser"
   * moment on a phone, the token lives in the Keychain/Keystore rather than in
   * web storage, and a 1-day session would mean re-authenticating an app people
   * open for two minutes at a time.
   */
  async _issueRefreshToken(user, { rememberMe = false, client = 'web' } = {}) {
    const longSession = rememberMe || client !== 'web';
    const ttl = longSession
      ? { str: '30d', ms: 30 * 24 * 60 * 60 * 1000 }
      : { str: '1d', ms: 24 * 60 * 60 * 1000 };

    const refreshToken = generateRefreshToken({ id: user.id }, ttl.str);
    const expiresAt = new Date(Date.now() + ttl.ms);

    await models.RefreshToken.create({
      userId: user.id,
      token: refreshToken,
      expiresAt,
      client,
      lastUsedAt: new Date()
    });

    return { refreshToken, expiresAt };
  }

  /** Shared by the refresh paths: the account must still be usable. */
  async _activeUserOrThrow(userId) {
    const user = await models.User.findByPk(userId);
    if (!user || user.status !== 'active') {
      throw new AuthenticationError(AUTH_MESSAGES.USER_NOT_FOUND);
    }
    return user;
  }

  /**
   * Logout — revoke one session.
   *
   * Deliberately keyed on the refresh token ALONE. Logout most often happens
   * when the app has been closed for a while, which is exactly when the access
   * token has expired; requiring one meant "sign out" silently failed to revoke
   * anything and the refresh token stayed live for its full lifetime.
   *
   * If the token was already rotated we revoke its successor too, so signing out
   * mid-refresh cannot leave a live descendant behind.
   */
  async logout(refreshToken) {
    if (!refreshToken) return true;

    const stored = await models.RefreshToken.findOne({ where: { token: refreshToken } });
    if (!stored) return true; // Already gone: logout is idempotent, never an error.

    const tokens = [refreshToken];
    if (stored.replacedByToken) tokens.push(stored.replacedByToken);

    await models.RefreshToken.update(
      { revokedAt: new Date(), revokedReason: 'logout' },
      { where: { token: { [Op.in]: tokens }, revokedAt: null } }
    );

    return true;
  }

  /**
   * Sign out everywhere — every device, including this one.
   *
   * The honest version of what the security screen promises. Also the right
   * response to "I think someone has my password".
   */
  async logoutAll(userId, reason = 'logout_all') {
    const [count] = await models.RefreshToken.update(
      { revokedAt: new Date(), revokedReason: reason },
      { where: { userId, revokedAt: null } }
    );
    return { revoked: count };
  }

  /**
   * Verify email
   */
  async verifyEmail(token) {
    const hashedToken = hashToken(token);

    // Find token
    const verificationToken = await models.EmailVerificationToken.findOne({
      where: {
        token: hashedToken,
        usedAt: null,
        expiresAt: { [Op.gt]: new Date() }
      }
    });

    if (!verificationToken) {
      throw new ValidationError(AUTH_MESSAGES.INVALID_TOKEN);
    }

    // Update user
    await models.User.update(
      { emailVerified: true, emailVerifiedAt: new Date() },
      { where: { id: verificationToken.userId } }
    );

    // Mark token as used
    verificationToken.usedAt = new Date();
    await verificationToken.save();

    return true;
  }

  async resendVerificationEmail(email) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await models.User.findOne({ where: { email: normalizedEmail } });

    if (!user) {
      // Prevent email enumeration.
      return true;
    }

    if (user.emailVerified) {
      return true;
    }

    const verificationToken = generateRandomToken();
    const hashedToken = hashToken(verificationToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await models.EmailVerificationToken.create({
      userId: user.id,
      token: hashedToken,
      expiresAt
    });

    notificationOrchestrator.sendEmailVerificationEmail(user, verificationToken).catch((error) => {
      console.warn('verification resend email failed:', error.message);
    });

    return true;
  }

  /**
   * Request password reset
   */
  async forgotPassword(email) {
    const user = await models.User.findOne({ where: { email } });
    
    if (!user) {
      // Don't reveal if email exists
      return true;
    }

    // Generate reset token
    const resetToken = generateRandomToken();
    const hashedToken = hashToken(resetToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await models.PasswordResetToken.create({
      userId: user.id,
      token: hashedToken,
      expiresAt
    });

    // Send reset email (non-blocking).
    notificationOrchestrator.sendPasswordResetEmail(user, resetToken).catch((error) => {
      console.warn('password reset email failed:', error.message);
    });

    return { resetToken }; // Return for testing, remove in production
  }

  /**
   * Reset password
   */
  async resetPassword(token, newPassword) {
    const hashedToken = hashToken(token);

    // Find token
    const resetToken = await models.PasswordResetToken.findOne({
      where: {
        token: hashedToken,
        usedAt: null,
        expiresAt: { [Op.gt]: new Date() }
      }
    });

    if (!resetToken) {
      throw new ValidationError(AUTH_MESSAGES.INVALID_TOKEN);
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update user password
    await models.User.update(
      { passwordHash: hashedPassword },
      { where: { id: resetToken.userId } }
    );

    // Mark token as used
    resetToken.usedAt = new Date();
    await resetToken.save();

    // Revoke all refresh tokens for this user
    await models.RefreshToken.update(
      { revokedAt: new Date() },
      { where: { userId: resetToken.userId } }
    );

    return true;
  }

  /**
   * Change password (when user is logged in)
   */
  async changePassword(userId, currentPassword, newPassword) {
    const user = await models.User.findByPk(userId);
    
    if (!user) {
      throw new NotFoundError(AUTH_MESSAGES.USER_NOT_FOUND);
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isPasswordValid) {
      throw new AuthenticationError('Current password is incorrect');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    user.passwordHash = hashedPassword;
    await user.save();

    // Revoke all refresh tokens except current session (optional)
    // For simplicity, we revoke all
    await models.RefreshToken.update(
      { isRevoked: true, revokedAt: new Date() },
      { where: { userId: user.id } }
    );

    return true;
  }

  /**
   * Get current user
   */
  async getCurrentUser(userId) {
    const user = await models.User.findByPk(userId, {
      attributes: { exclude: ['password', 'passwordHash'] },
      include: [
        { model: models.MentorProfile, as: 'mentorProfile' },
        { model: models.MenteeProfile, as: 'menteeProfile' },
        { model: models.AdminProfile, as: 'adminProfile' },
        {
          model: models.ClanMembership,
          as: 'clanMemberships',
          required: false,
          where: { status: 'active' },
          include: [{ model: models.Clan, as: 'clan', attributes: ['id', 'name', 'programId', 'status'] }]
        }
      ]
    });

    if (!user) {
      throw new NotFoundError(AUTH_MESSAGES.USER_NOT_FOUND);
    }

    // Capabilities + permissions are DERIVED from the user's live roles, never
    // the stored array, so the role switcher and UI gates reflect reality.
    const authzService = require('./authzService');
    const assignments = await authzService.getAssignments(user);
    const json = user.toJSON();
    json.capabilities = await authzService.getCapabilities(user, { assignments });
    json.permissions = await authzService.getPermissionUnion(user);
    json.canAccessAdmin = await authzService.hasAdminAccess(user, { assignments });
    return json;
  }

  /**
   * Verify 2FA code during login
   */
  async verify2FADuringLogin(userId, code, rememberMe = false, client = 'web') {
    const securityService = require('./securityService');
    
    // Verify 2FA code (TOTP or backup code)
    const result = await securityService.verify2FAToken(userId, code);
    
    // Get user
    const user = await models.User.findByPk(userId, {
      include: [
        { model: models.MentorProfile, as: 'mentorProfile' },
        { model: models.MenteeProfile, as: 'menteeProfile' },
        { model: models.AdminProfile, as: 'adminProfile' }
      ]
    });

    // Update last login
    user.lastLoginAt = new Date();
    await user.save();

    // Generate full tokens
    const accessToken = generateAccessToken({ 
      id: user.id, 
      email: user.email, 
      role: user.role 
    });
    const { refreshToken } = await this._issueRefreshToken(user, { rememberMe, client });

    // Remove password from response
    const userResponse = user.toJSON();
    delete userResponse.passwordHash;

    return {
      user: userResponse,
      accessToken,
      refreshToken,
      twoFactorType: result.type
    };
  }
}

module.exports = new AuthService();
