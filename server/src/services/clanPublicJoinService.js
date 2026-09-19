const crypto = require('crypto');
const { Op } = require('sequelize');
const { models } = require('../db');
const {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConflictError,
  AuthorizationError
} = require('../utils/errors/errorTypes');
const { createAuditLog } = require('../utils/auditContext');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const { zonedWallClockToUtc, endOfDayInZone } = require('../utils/timezone');

/** Active mentee memberships count toward capacity / "already placed" checks. */
const ACTIVE_MENTEE_STATUSES = ['active', 'paused'];
const MENTOR_CLAN_ROLES = ['lead_mentor', 'co_mentor', 'core_team'];
const JOINING_MESSAGE =
  'Anyone with this link can request to join. The Clan Lead Mentor must approve the request before membership is granted.';

/**
 * Public clan joining: admin grants access → lead mentor generates an opaque
 * link (optional start/end window) → visitors request membership → lead approves/rejects.
 *
 * Authorization is intentional and narrow:
 *   - Admin (program-scoped): grant/remove publicJoinAllowed only
 *   - Current Clan Lead Mentor only: link + join window + request decisions
 *   - Co-mentors / mentees: never manage this surface
 */
class ClanPublicJoinService {
  /**
   * Resolve a public slug. Never throws for "not allowed" — callers map !open to 404.
   */
  async resolveBySlug(slug) {
    if (!slug || typeof slug !== 'string') {
      return { clan: null, open: false, reasons: ['invalid'], windowStatus: null };
    }

    const clan = await models.Clan.findOne({
      where: { publicJoinSlug: slug },
      include: [
        { model: models.Program, as: 'program', attributes: ['id', 'name', 'status'] }
      ]
    });
    if (!clan) return { clan: null, open: false, reasons: ['not_found'], windowStatus: null };

    const reasons = [];
    if (!clan.publicJoinAllowed) reasons.push('not_allowed');
    if (!clan.publicJoinEnabled) reasons.push('disabled');
    if (clan.status !== 'active') reasons.push('clan_inactive');
    if (!clan.publicJoinSlug) reasons.push('no_slug');

    const windowStatus = this._windowStatus(clan);
    if (windowStatus === 'upcoming') reasons.push('not_started');
    if (windowStatus === 'expired') reasons.push('expired');

    const menteeCount = await this._countMentees(clan.id);
    const max = clan.maxMentees == null ? null : Number(clan.maxMentees);
    if (max != null && menteeCount >= max) reasons.push('full');

    return {
      clan,
      open: reasons.length === 0,
      reasons,
      windowStatus,
      menteeCount,
      seatsRemaining: max == null ? null : Math.max(0, max - menteeCount)
    };
  }

  async requireOpenBySlug(slug) {
    const resolved = await this.resolveBySlug(slug);
    if (!resolved.open || !resolved.clan) {
      if (resolved.reasons?.includes('not_started')) {
        throw new NotFoundError('This clan joining link is not open yet.');
      }
      if (resolved.reasons?.includes('expired')) {
        throw new NotFoundError('This clan joining link has expired.');
      }
      throw new NotFoundError('This clan joining link is invalid or no longer available.');
    }
    return resolved;
  }

  /**
   * Admin-only: grant/remove public joining access.
   * Join window (start/end) is set by the Lead Mentor when generating the link.
   * Accepts either a boolean (legacy) or `{ allowed }`.
   */
  async setPublicJoinAccess(clanId, payload, actor) {
    const body = typeof payload === 'boolean' ? { allowed: payload } : (payload || {});
    const clan = await this._loadClan(clanId);
    await this._assertAdminCanManageClanAccess(actor, clan);

    const next = Boolean(body.allowed);
    clan.publicJoinAllowed = next;
    if (!next) {
      // Immediately disable activation; keep slug + window for audit/history.
      clan.publicJoinEnabled = false;
    }

    await clan.save();

    await this._audit({
      userId: actor.id,
      action: next ? 'clan.public_join.access_granted' : 'clan.public_join.access_removed',
      entityType: 'clan',
      entityId: clan.id,
      metadata: { publicJoinAllowed: next }
    });

    return this._serializeState(clan, { includeUrl: false });
  }

  /**
   * Admin-only: grant/remove public joining access for many clans at once.
   */
  async bulkSetPublicJoinAccess({ clanIds, ...payload } = {}, actor) {
    const ids = [...new Set((Array.isArray(clanIds) ? clanIds : []).filter(Boolean))];
    if (!ids.length) throw new ValidationError('Select at least one clan');
    if (ids.length > 100) throw new ValidationError('You can update at most 100 clans at once');

    const results = [];
    for (const clanId of ids) {
      const state = await this.setPublicJoinAccess(clanId, payload, actor);
      results.push({ clanId, ...state });
    }
    return { updated: results.length, clans: results };
  }

  /**
   * Lead mentor or admin: current public-join settings for a clan.
   */
  async getPublicJoinState(clanId, actor) {
    const clan = await this._loadClan(clanId);
    const { isLead, isAdmin } = await this._actorCanViewJoinState(actor, clan);
    if (!isLead && !isAdmin) {
      throw new ForbiddenError('You do not have permission to view public joining settings for this clan');
    }

    // Lead may see the URL only when admin has granted access.
    const includeUrl = Boolean(clan.publicJoinAllowed) && (isLead || isAdmin);
    return {
      clanId: clan.id,
      clanName: clan.name,
      ...this._serializeState(clan, { includeUrl })
    };
  }

  /**
   * Lead mentor: mint (if needed) and enable the public joining link.
   * Optional body sets the join window (wall-clock + timezone → UTC), same as cohort apply.
   */
  async generateOrEnableLink(clanId, actor, body = {}) {
    const clan = await this._loadClan(clanId);
    await this._assertLeadCanManageLink(actor, clan, { requireActive: true });

    if (!clan.publicJoinSlug) {
      clan.publicJoinSlug = await this._mintUniqueSlug();
    }
    clan.publicJoinEnabled = true;
    this._applyJoinWindow(clan, body || {});
    await clan.save();

    await this._audit({
      userId: actor.id,
      action: 'clan.public_join.link_enabled',
      entityType: 'clan',
      entityId: clan.id,
      metadata: {
        slugPrefix: clan.publicJoinSlug.slice(0, 4),
        publicJoinStartsAt: clan.publicJoinStartsAt,
        publicJoinEndsAt: clan.publicJoinEndsAt,
        publicJoinTimezone: clan.publicJoinTimezone
      }
    });

    return this._serializeState(clan, { includeUrl: true });
  }

  /**
   * Lead mentor: disable the public joining link without clearing the slug.
   */
  async disableLink(clanId, actor) {
    const clan = await this._loadClan(clanId);
    await this._assertLeadCanManageLink(actor, clan);

    clan.publicJoinEnabled = false;
    await clan.save();

    await this._audit({
      userId: actor.id,
      action: 'clan.public_join.link_disabled',
      entityType: 'clan',
      entityId: clan.id
    });

    return this._serializeState(clan, { includeUrl: true });
  }

  /**
   * Lead mentor: rotate the slug (old URL stops working) and keep the link enabled.
   * Optional body can also update the join window.
   */
  async regenerateLink(clanId, actor, body = {}) {
    const clan = await this._loadClan(clanId);
    await this._assertLeadCanManageLink(actor, clan, { requireActive: true });

    const previous = clan.publicJoinSlug;
    clan.publicJoinSlug = await this._mintUniqueSlug();
    clan.publicJoinEnabled = true;
    this._applyJoinWindow(clan, body || {});
    await clan.save();

    await this._audit({
      userId: actor.id,
      action: 'clan.public_join.link_regenerated',
      entityType: 'clan',
      entityId: clan.id,
      metadata: {
        previousPrefix: previous ? previous.slice(0, 4) : null,
        slugPrefix: clan.publicJoinSlug.slice(0, 4),
        publicJoinStartsAt: clan.publicJoinStartsAt,
        publicJoinEndsAt: clan.publicJoinEndsAt,
        publicJoinTimezone: clan.publicJoinTimezone
      }
    });

    return this._serializeState(clan, { includeUrl: true });
  }

  /**
   * Where a signed-in viewer stands relative to this clan's join flow.
   */
  async getViewerStatus(clanId, userId) {
    if (!userId) return 'anonymous';

    if (await this._isActiveMenteeOfClan(userId, clanId)) {
      // Public-link approval vs admin-placed member — distinct copy on the join page.
      const approvedViaLink = await models.ClanJoinRequest.findOne({
        where: { clanId, userId, status: 'approved', source: 'public_link' },
        attributes: ['id']
      });
      return approvedViaLink ? 'approved' : 'already_member';
    }

    const pending = await models.ClanJoinRequest.findOne({
      where: { clanId, userId, status: 'pending' },
      attributes: ['id']
    });
    if (pending) return 'pending';

    // Mentors of this clan should not join as mentee via public link.
    if (await this._isMentorOfClan(userId, clanId)) return 'mentor_of_clan';
    return 'eligible';
  }

  /**
   * Public join page payload. Returns clan info even when the window is
   * upcoming/expired/full so the UI can explain why joining is closed.
   */
  async getPublicClanInfo(slug, viewerUserId = null) {
    const resolved = await this.resolveBySlug(slug);
    if (!resolved.clan) {
      throw new NotFoundError('This clan joining link is invalid or no longer available.');
    }

    const { clan, menteeCount, seatsRemaining, open, reasons, windowStatus } = resolved;
    const hardClosed = reasons.some((r) => !['not_started', 'expired', 'full'].includes(r));
    if (hardClosed) {
      throw new NotFoundError('This clan joining link is invalid or no longer available.');
    }

    const viewerStatus = await this.getViewerStatus(clan.id, viewerUserId);

    let message = JOINING_MESSAGE;
    if (reasons.includes('not_started')) {
      message = 'This joining link is not open yet. Please check back after the start time.';
    } else if (reasons.includes('expired')) {
      message = 'This joining link has expired and is no longer accepting requests.';
    } else if (reasons.includes('full')) {
      message = 'This clan is currently full and is not accepting new join requests.';
    }

    return {
      token: clan.publicJoinSlug,
      clan: {
        name: clan.name,
        description: clan.description || null,
        maxMentees: clan.maxMentees,
        menteeCount,
        seatsRemaining
      },
      program: clan.program ? { name: clan.program.name } : null,
      joining: {
        requiresApproval: true,
        message,
        open,
        windowStatus,
        startsAt: clan.publicJoinStartsAt || null,
        endsAt: clan.publicJoinEndsAt || null,
        timezone: clan.publicJoinTimezone || null
      },
      viewerStatus
    };
  }

  /**
   * Details for the registration page when using a public clan join slug.
   * Safe subset only; still 404s if the link is not currently usable.
   */
  async getRegistrationDetailsForSlug(slug) {
    const { clan } = await this.requireOpenBySlug(slug);
    return {
      role: 'mentee',
      emailLocked: false,
      program: clan.program ? { id: clan.program.id, name: clan.program.name } : null,
      clan: { id: clan.id, name: clan.name },
      requiresApproval: true,
      joinPath: `/clan/join/${clan.publicJoinSlug}`
    };
  }

  /**
   * Authenticated visitor: create a pending join request for an open slug.
   */
  async createJoinRequest(slug, user, { message } = {}) {
    if (!user?.id) throw new AuthorizationError('Authentication required');
    if (user.status && user.status !== 'active') {
      throw new ForbiddenError('Your account cannot submit join requests');
    }

    const resolved = await this.requireOpenBySlug(slug);
    const clan = resolved.clan;

    if (await this._isActiveMenteeOfClan(user.id, clan.id)) {
      throw new ConflictError('You are already a member of this clan.');
    }

    if (await this._isMentorOfClan(user.id, clan.id)) {
      throw new ConflictError('You already have a mentor role in this clan and cannot join as a mentee via this link.');
    }

    const existingPending = await models.ClanJoinRequest.findOne({
      where: { clanId: clan.id, userId: user.id, status: 'pending' }
    });
    if (existingPending) {
      throw new ConflictError('Your request to join this clan is already pending.');
    }

    if (resolved.reasons?.includes('full') || (resolved.seatsRemaining != null && resolved.seatsRemaining <= 0)) {
      throw new ConflictError('This clan is currently full and is not accepting new join requests.');
    }

    let request;
    try {
      request = await models.ClanJoinRequest.create({
        clanId: clan.id,
        userId: user.id,
        status: 'pending',
        source: 'public_link',
        message: message ? String(message).trim().slice(0, 2000) : null
      });
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') {
        throw new ConflictError('Your request to join this clan is already pending.');
      }
      throw error;
    }

    await this._audit({
      userId: user.id,
      action: 'clan.public_join.request_created',
      entityType: 'clan_join_request',
      entityId: request.id,
      metadata: { clanId: clan.id }
    });

    this._notifyLeadOfJoinRequest({ clan, requester: user, request }).catch((e) =>
      console.warn('clan join request notify failed:', e.message)
    );

    return this._serializeRequest(request);
  }

  /**
   * Lead mentor: list join requests for a clan (optionally filtered by status).
   * Includes the profile / placement context a lead needs before approve/reject.
   */
  async listJoinRequests(clanId, actor, { status } = {}) {
    const clan = await this._loadClan(clanId);
    await this._assertCurrentLeadMentor(actor, clan);

    const where = { clanId };
    if (status) where.status = status;

    const rows = await models.ClanJoinRequest.findAll({
      where,
      include: [{
        model: models.User,
        as: 'user',
        attributes: [
          'id', 'firstName', 'lastName', 'email', 'role', 'status',
          'profilePictureUrl', 'bio', 'city', 'country', 'languages',
          'emailVerified', 'createdAt'
        ],
        include: [{
          model: models.MenteeProfile,
          as: 'menteeProfile',
          attributes: [
            'currentEducation', 'currentOccupation', 'learningGoals', 'interests',
            'priorExperience', 'linkedinUrl', 'githubUrl', 'portfolioUrl'
          ],
          required: false
        }]
      }],
      order: [['createdAt', 'ASC']]
    });

    const menteeCount = await this._countMentees(clanId);
    const seatsRemaining = clan.maxMentees != null
      ? Math.max(0, Number(clan.maxMentees) - menteeCount)
      : null;
    const atCapacity = seatsRemaining === 0;

    const userIds = rows.map((r) => r.userId).filter(Boolean);
    const placements = userIds.length
      ? await models.ClanMembership.findAll({
          where: {
            userId: { [Op.in]: userIds },
            role: 'mentee',
            status: { [Op.in]: ACTIVE_MENTEE_STATUSES }
          },
          include: [{ model: models.Clan, as: 'clan', attributes: ['id', 'name'] }]
        })
      : [];
    const placementByUser = new Map(placements.map((p) => [p.userId, p]));

    return rows.map((row) => {
      const placement = placementByUser.get(row.userId) || null;
      const alreadyHere = Boolean(placement && placement.clanId === clanId);
      const elsewhere = placement && placement.clanId !== clanId
        ? { clanId: placement.clanId, clanName: placement.clan?.name || 'another clan' }
        : null;

      let blockedReason = null;
      if (atCapacity && row.status === 'pending') blockedReason = 'clan_full';
      else if (row.user && row.user.status !== 'active') blockedReason = 'user_inactive';

      return this._serializeRequest(row, {
        user: this._serializeJoinRequester(row.user),
        alreadyMember: alreadyHere,
        placedElsewhere: elsewhere,
        seatsRemaining,
        blockedReason
      });
    });
  }

  /**
   * Lead mentor: approve a pending request and add the user as a mentee.
   */
  async approveJoinRequest(clanId, requestId, actor) {
    const clan = await this._loadClan(clanId);
    await this._assertCurrentLeadMentor(actor, clan);

    const request = await models.ClanJoinRequest.findOne({ where: { id: requestId, clanId } });
    if (!request) throw new NotFoundError('Join request not found');
    if (request.status !== 'pending') {
      throw new ConflictError(`This join request is already ${request.status}`);
    }

    const user = await models.User.findByPk(request.userId);
    if (!user || user.status !== 'active') {
      throw new ValidationError('This user is no longer eligible to join');
    }

    if (await this._isActiveMenteeOfClan(user.id, clanId)) {
      request.status = 'approved';
      request.reviewedBy = actor.id;
      request.reviewedAt = new Date();
      request.resolutionNote = request.resolutionNote || 'Already a member';
      await request.save();
      return { request: this._serializeRequest(request), membership: null, alreadyMember: true };
    }

    const menteeCount = await this._countMentees(clanId);
    if (clan.maxMentees != null && menteeCount >= clan.maxMentees) {
      throw new ConflictError('This clan is at capacity. Free a seat before approving.');
    }

    // Re-check lead still current at approval time.
    const freshClan = await models.Clan.findByPk(clanId);
    if (!freshClan || freshClan.leadMentorId !== actor.id) {
      throw new ForbiddenError('Only the current Clan Lead Mentor can approve join requests');
    }

    // Atomic claim: only one approver wins if two hit at once.
    const [claimed] = await models.ClanJoinRequest.update(
      {
        status: 'approved',
        reviewedBy: actor.id,
        reviewedAt: new Date()
      },
      { where: { id: requestId, clanId, status: 'pending' } }
    );
    if (!claimed) {
      throw new ConflictError('This join request was already processed');
    }

    let membership;
    try {
      // Lazy — clanService can cycle back through membership writes.
      const clanService = require('./clanService');
      membership = await clanService.addMember(
        clanId,
        { userId: user.id, role: 'mentee' },
        actor
      );
    } catch (error) {
      // Roll request back to pending so the lead can retry after fixing the issue,
      // unless membership already exists for this clan (treat as success).
      if (error instanceof ConflictError && /already a mentee of this clan/i.test(error.message)) {
        await request.reload();
        return { request: this._serializeRequest(request), membership: null, alreadyMember: true };
      }
      await models.ClanJoinRequest.update(
        {
          status: 'pending',
          reviewedBy: null,
          reviewedAt: null
        },
        { where: { id: requestId, clanId, status: 'approved' } }
      );
      throw error;
    }

    await this._audit({
      userId: actor.id,
      action: 'clan.public_join.request_approved',
      entityType: 'clan_join_request',
      entityId: request.id,
      metadata: { clanId, userId: user.id }
    });

    await request.reload();

    this._notifyRequesterDecision({ userId: user.id, clan, approved: true })
      .catch((e) => console.warn('join approve notify failed:', e.message));

    return { request: this._serializeRequest(request), membership, alreadyMember: false };
  }

  /**
   * Lead mentor: reject a pending join request.
   */
  async rejectJoinRequest(clanId, requestId, actor, { note } = {}) {
    const clan = await this._loadClan(clanId);
    await this._assertCurrentLeadMentor(actor, clan);

    const request = await models.ClanJoinRequest.findOne({ where: { id: requestId, clanId } });
    if (!request) throw new NotFoundError('Join request not found');
    if (request.status !== 'pending') {
      throw new ConflictError(`This join request is already ${request.status}`);
    }

    request.status = 'rejected';
    request.reviewedBy = actor.id;
    request.reviewedAt = new Date();
    request.resolutionNote = note ? String(note).trim().slice(0, 2000) : null;
    await request.save();

    await this._audit({
      userId: actor.id,
      action: 'clan.public_join.request_rejected',
      entityType: 'clan_join_request',
      entityId: request.id,
      metadata: { clanId, userId: request.userId }
    });

    this._notifyRequesterDecision({
      userId: request.userId,
      clan,
      approved: false,
      note: request.resolutionNote
    })
      .catch((e) => console.warn('join reject notify failed:', e.message));

    return this._serializeRequest(request);
  }

  // ── Private helpers (same `_` convention as AuthService) ────────────────────

  _buildJoinUrl(slug) {
    const base = (process.env.CLIENT_URL || 'http://localhost:3000').split(',')[0].replace(/\/$/, '');
    return `${base}/clan/join/${slug}`;
  }

  async _mintUniqueSlug() {
    for (let i = 0; i < 8; i += 1) {
      const slug = crypto.randomBytes(9).toString('base64url');
      const clash = await models.Clan.findOne({ where: { publicJoinSlug: slug }, attributes: ['id'] });
      if (!clash) return slug;
    }
    throw new ValidationError('Could not generate a unique joining link, try again');
  }

  _displayName(user) {
    if (!user) return 'Someone';
    return `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Someone';
  }

  _serializeState(clan, { includeUrl = false } = {}) {
    const linkExists = Boolean(clan.publicJoinSlug);
    const windowStatus = this._windowStatus(clan);
    const usable = Boolean(
      clan.publicJoinAllowed
      && clan.publicJoinEnabled
      && clan.publicJoinSlug
      && clan.status === 'active'
      && windowStatus === 'active'
    );
    return {
      publicJoinAllowed: Boolean(clan.publicJoinAllowed),
      publicJoinEnabled: Boolean(clan.publicJoinEnabled),
      publicJoinLinkExists: linkExists,
      publicJoinUsable: usable,
      publicJoinUrl: includeUrl && linkExists ? this._buildJoinUrl(clan.publicJoinSlug) : null,
      publicJoinStartsAt: clan.publicJoinStartsAt || null,
      publicJoinEndsAt: clan.publicJoinEndsAt || null,
      publicJoinTimezone: clan.publicJoinTimezone || null,
      publicJoinWindowStatus: windowStatus
    };
  }

  /**
   * active | upcoming | expired — based on optional UTC window bounds.
   * No bounds → always active (current behavior).
   */
  _windowStatus(clan, now = new Date()) {
    const starts = clan.publicJoinStartsAt ? new Date(clan.publicJoinStartsAt) : null;
    const ends = clan.publicJoinEndsAt ? new Date(clan.publicJoinEndsAt) : null;
    if (starts && !Number.isNaN(starts.getTime()) && now < starts) return 'upcoming';
    if (ends && !Number.isNaN(ends.getTime()) && now > ends) return 'expired';
    return 'active';
  }

  /**
   * Apply join-window fields onto a clan instance (does not save).
   * Same contract as cohort intake: calendar date + optional time + IANA zone → UTC.
   * Blank date clears that bound. ISO startsAt/endsAt still accepted if sent directly.
   */
  _applyJoinWindow(clan, body) {
    const hasWindowInput = [
      'startsDate', 'startsTime', 'endsDate', 'endsTime',
      'startsAt', 'endsAt', 'timezone'
    ].some((k) => body[k] !== undefined);
    if (!hasWindowInput) return;

    const tz = body.timezone || clan.publicJoinTimezone || 'UTC';
    if (body.timezone !== undefined) {
      clan.publicJoinTimezone = body.timezone ? String(body.timezone).trim() : null;
    }

    if (body.startsAt !== undefined) {
      clan.publicJoinStartsAt = body.startsAt ? new Date(body.startsAt) : null;
    } else if (body.startsDate !== undefined) {
      clan.publicJoinStartsAt = body.startsDate
        ? zonedWallClockToUtc(body.startsDate, body.startsTime || '00:00', tz)
        : null;
      if (body.startsDate && !clan.publicJoinTimezone) clan.publicJoinTimezone = tz;
    }

    if (body.endsAt !== undefined) {
      clan.publicJoinEndsAt = body.endsAt ? new Date(body.endsAt) : null;
    } else if (body.endsDate !== undefined) {
      clan.publicJoinEndsAt = body.endsDate
        ? (body.endsTime
          ? zonedWallClockToUtc(body.endsDate, body.endsTime, tz)
          : endOfDayInZone(body.endsDate, tz))
        : null;
      if (body.endsDate && !clan.publicJoinTimezone) clan.publicJoinTimezone = tz;
    }

    const starts = clan.publicJoinStartsAt ? new Date(clan.publicJoinStartsAt) : null;
    const ends = clan.publicJoinEndsAt ? new Date(clan.publicJoinEndsAt) : null;
    if (starts && ends && ends < starts) {
      throw new ValidationError('Join window end must be after the start');
    }
  }

  _serializeRequest(row, extras = {}) {
    const item = row.toJSON ? row.toJSON() : row;
    return {
      id: item.id,
      clanId: item.clanId,
      userId: item.userId,
      status: item.status,
      source: item.source,
      message: item.message || null,
      resolutionNote: item.resolutionNote || null,
      reviewedBy: item.reviewedBy || null,
      reviewedAt: item.reviewedAt || null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      ...extras
    };
  }

  _serializeJoinRequester(user) {
    if (!user) return null;
    const profile = user.menteeProfile || null;
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role || null,
      status: user.status || null,
      profilePictureUrl: user.profilePictureUrl || null,
      bio: user.bio || null,
      city: user.city || null,
      country: user.country || null,
      languages: Array.isArray(user.languages) ? user.languages : [],
      emailVerified: Boolean(user.emailVerified),
      memberSince: user.createdAt || null,
      currentEducation: profile?.currentEducation || null,
      currentOccupation: profile?.currentOccupation || null,
      learningGoals: Array.isArray(profile?.learningGoals) ? profile.learningGoals : [],
      interests: Array.isArray(profile?.interests) ? profile.interests : [],
      priorExperience: profile?.priorExperience || null,
      linkedinUrl: profile?.linkedinUrl || null,
      githubUrl: profile?.githubUrl || null,
      portfolioUrl: profile?.portfolioUrl || null
    };
  }

  async _loadClan(clanId, transaction) {
    const clan = await models.Clan.findByPk(clanId, {
      include: [
        { model: models.Program, as: 'program', attributes: ['id', 'name', 'status'] }
      ],
      transaction
    });
    if (!clan) throw new NotFoundError('Clan not found');
    return clan;
  }

  async _countMentees(clanId, transaction) {
    return models.ClanMembership.count({
      where: {
        clanId,
        role: 'mentee',
        status: { [Op.in]: ACTIVE_MENTEE_STATUSES }
      },
      transaction
    });
  }

  async _isActiveMenteeOfClan(userId, clanId, transaction) {
    const row = await models.ClanMembership.findOne({
      where: {
        userId,
        clanId,
        role: 'mentee',
        status: { [Op.in]: ACTIVE_MENTEE_STATUSES }
      },
      attributes: ['id'],
      transaction
    });
    return Boolean(row);
  }

  async _isMentorOfClan(userId, clanId, transaction) {
    const row = await models.ClanMembership.findOne({
      where: {
        clanId,
        userId,
        status: 'active',
        role: { [Op.in]: MENTOR_CLAN_ROLES }
      },
      attributes: ['id'],
      transaction
    });
    return Boolean(row);
  }

  async _audit(payload) {
    try {
      await createAuditLog(payload);
    } catch (e) {
      console.warn('clan public join audit failed:', e.message);
    }
  }

  /** Current Clan Lead Mentor only (pointer on Clan). Admins / co-mentors are not leads. */
  async _assertCurrentLeadMentor(user, clan) {
    if (!user?.id || !clan?.leadMentorId || clan.leadMentorId !== user.id) {
      throw new ForbiddenError('Only the current Clan Lead Mentor can perform this action');
    }
  }

  async _assertAdminCanManageClanAccess(user, clan, opts = {}) {
    // Lazy — authzService is heavy and avoids a top-level cycle with access layers.
    const authzService = require('./authzService');
    // Clan lead mentors hold clan.manage_members but must never grant this feature.
    if (!(await authzService.hasAdminAccess(user, { assignments: opts.assignments }))) {
      throw new ForbiddenError('Only an administrator can grant or remove public joining access');
    }
    await authzService.assertProgramInScope(user, clan.programId, { assignments: opts.assignments });
  }

  async _assertLeadCanManageLink(actor, clan, { requireActive = false } = {}) {
    await this._assertCurrentLeadMentor(actor, clan);
    if (!clan.publicJoinAllowed) {
      throw new ForbiddenError('Public joining has not been enabled for this clan by an administrator');
    }
    if (requireActive && clan.status !== 'active') {
      throw new ValidationError('Public joining is only available while the clan is active');
    }
  }

  async _actorCanViewJoinState(actor, clan) {
    if (clan.leadMentorId === actor.id) return { isLead: true, isAdmin: false };
    try {
      await this._assertAdminCanManageClanAccess(actor, clan);
      return { isLead: false, isAdmin: true };
    } catch (_) {
      return { isLead: false, isAdmin: false };
    }
  }

  async _notifyLeadOfJoinRequest({ clan, requester, request }) {
    if (!clan.leadMentorId) return;
    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.CLAN_JOIN_REQUEST_RECEIVED,
      recipients: [{ userId: clan.leadMentorId }],
      payload: {
        title: 'New clan join request',
        message: `${this._displayName(requester)} requested to join your clan "${clan.name}".`,
        actionUrl: '/mentor/clan-team',
        actionLabel: 'Review request',
        relatedEntityType: 'clan_join_request',
        relatedEntityId: request.id
      }
    });
  }

  async _notifyRequesterDecision({ userId, clan, approved, note }) {
    const base = approved
      ? `Your request to join "${clan.name}" was approved.`
      : `Your request to join "${clan.name}" was not approved.`;
    const withNote = !approved && note ? `${base} Note: ${note}` : base;
    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.CLAN_JOIN_REQUEST_DECIDED,
      recipients: [{ userId }],
      payload: {
        title: approved ? 'Clan join request approved' : 'Clan join request rejected',
        message: withNote,
        actionUrl: '/mentee/dashboard',
        actionLabel: 'Open PathMent',
        relatedEntityType: 'clan',
        relatedEntityId: clan.id
      }
    });
  }
}

module.exports = new ClanPublicJoinService();
