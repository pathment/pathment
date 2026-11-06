/**
 * poolMemberService — candidates into a System Pool and out of it.
 *
 * Ways in (all end in one PoolMember row per person per pool):
 *   - a CSV / email list            importMembers
 *   - one invitation                importMembers with a single row
 *   - an existing Pathment account  importMembers matches it by email
 *   - accepted applications         addFromApplications
 *
 * Retrying any of them is safe: the member is unique per (pool, email), so a
 * second run reports "already in this pool" instead of adding anybody twice,
 * and an active invitation is reused instead of a second one being sent.
 *
 * Pool membership creates NO enrollment and NO clan membership. Somebody who
 * has no account gets a pool invitation with no programme and no clan on it;
 * activating it creates their account and nothing else (see authService).
 */
const { Op, UniqueConstraintError } = require('sequelize');
const { models, sequelize } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');
const { generateRandomToken, hashToken } = require('../utils/jwt');
const { inviteLink } = require('../utils/links');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const { PERMISSIONS: P } = require('../config/permissions');
const poolService = require('./poolService');
const { ADJUSTMENT_KEY, MAX_WORK_POINTS } = poolService;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_DEFAULT_DAYS = 14;
const INVITE_MAX_DAYS = 30;

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

/** A row from a CSV or the UI → { email, firstName, lastName }, header-agnostic. */
function readRow(row) {
  if (typeof row === 'string') return { email: row };
  const pick = (...keys) => {
    for (const k of Object.keys(row || {})) {
      if (keys.includes(k.trim().toLowerCase().replace(/[\s_-]+/g, ''))) return row[k];
    }
    return undefined;
  };
  return {
    email: pick('email', 'emailaddress', 'mail'),
    firstName: pick('firstname', 'first', 'givenname'),
    lastName: pick('lastname', 'last', 'surname', 'familyname'),
    // An imported sheet may carry the level too; applications bring their own.
    level: pick('level', 'tier', 'track') ?? row?.level,
    applicationId: row?.applicationId,
  };
}

class PoolMemberService {
  constructor() {
    this.normalizeEmail = normalizeEmail;
  }

  async _member(poolId, memberId) {
    const member = await models.PoolMember.findOne({ where: { id: memberId, poolId } });
    if (!member) throw new NotFoundError('Candidate not found in this pool');
    return member;
  }

  /**
   * How long a pool invitation stays valid: until the pool closes when that is
   * set (capped at 30 days), otherwise two weeks.
   */
  _inviteExpiry(pool) {
    const max = Date.now() + INVITE_MAX_DAYS * 86400000;
    const closes = pool.closesAt ? new Date(pool.closesAt).getTime() : null;
    const until = closes && closes > Date.now() ? Math.min(closes, max) : Date.now() + INVITE_DEFAULT_DAYS * 86400000;
    return new Date(until);
  }

  /**
   * Make sure an invited member holds a working invitation, without ever
   * creating a second active one for the same address.
   *
   * Only one active learner invitation may exist per email (a database rule).
   * If one already exists — another pool's, or an ordinary programme invite —
   * it is reused: activation links pool memberships by email, so registering
   * through ANY invitation to that address activates this one too.
   */
  async _ensureInvite(member, pool, actorId, { forceNew = false } = {}) {
    const now = new Date();
    const active = await models.RegistrationInvite.findOne({
      where: { email: member.email, role: 'mentee', usedAt: null, revokedAt: null, expiresAt: { [Op.gt]: now } },
    });
    if (active && !forceNew) {
      if (member.inviteId !== active.id) await member.update({ inviteId: active.id });
      return { invite: active, reused: true };
    }
    if (active && forceNew) {
      // Resend replaces OUR invitation only; someone else's (a programme invite)
      // is never revoked from here.
      if (!active.metadata?.pool) return { invite: active, reused: true };
      await active.update({ revokedAt: now });
    }
    // An expired-but-unrevoked invite still occupies the active-unique slot.
    await models.RegistrationInvite.update(
      { revokedAt: now },
      { where: { email: member.email, role: 'mentee', usedAt: null, revokedAt: null, expiresAt: { [Op.lte]: now } } }
    );
    const rawToken = generateRandomToken();
    let invite;
    try {
      invite = await models.RegistrationInvite.create({
        tokenHash: hashToken(rawToken),
        email: member.email,
        role: 'mentee',
        invitedBy: actorId,
        expiresAt: this._inviteExpiry(pool),
        programId: null,
        clanId: null,
        cohortId: null,
        metadata: { pool: true, poolId: pool.id, poolMemberId: member.id },
      });
    } catch (error) {
      if (!(error instanceof UniqueConstraintError)) throw error;
      // Lost a race with a concurrent import — use the winner's invitation.
      const winner = await models.RegistrationInvite.findOne({
        where: { email: member.email, role: 'mentee', usedAt: null, revokedAt: null },
      });
      if (winner) await member.update({ inviteId: winner.id });
      return { invite: winner, reused: true };
    }
    await member.update({ inviteId: invite.id });
    await this._sendInviteEmail(member, pool, inviteLink(rawToken), invite.expiresAt);
    return { invite, reused: false };
  }

  async _sendInviteEmail(member, pool, inviteUrl, expiresAt) {
    try {
      const program = await models.Program.findByPk(pool.programId, { attributes: ['name'] });
      const due = pool.qualificationDueAt || expiresAt;
      const dueText = due ? new Date(due).toUTCString().replace(/ \d\d:\d\d:\d\d GMT$/, '') : null;
      const hi = member.details?.firstName ? `Hi ${member.details.firstName},` : 'Hi,';
      const text =
        `${hi}\n\n` +
        `You have been invited to the ${pool.name} selection pool${program ? ` for ${program.name}` : ''}.\n\n` +
        'Set up your Pathment account to see your qualifying work:\n' +
        `${inviteUrl}\n\n` +
        (dueText ? `Please complete it by ${dueText}.\n\n` : '') +
        'This link is for you only and can be used once. ' +
        'If you were not expecting this, you can ignore this email.\n\n' +
        '- The Pathment team';
      await require('./emailService').enqueue({
        to: member.email,
        emailType: 'registration_invite',
        priority: 1,
        idempotencyKey: `pool-invite:${member.id}:${inviteUrl.split('invite=')[1] || inviteUrl}`,
        subject: `You're invited: ${pool.name}`,
        text,
        html: `<div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;font-size:15px;line-height:1.6;max-width:520px;margin:0 auto;padding:8px 4px;">`
          + text.split('\n\n').map((p) => `<p style="margin:0 0 14px;">${p.replace(inviteUrl, `<a href="${inviteUrl}" style="color:#0052D6;font-weight:600;">Set up my account</a>`).replace(/\n/g, '<br>')}</p>`).join('')
          + '</div>',
      });
    } catch (error) {
      console.error('[pool] invite email not enqueued:', error.message);
    }
  }

  /**
   * Add candidates by email. Returns one result per row — added (existing
   * account), invited, skipped (already in the pool / duplicate row) or failed
   * (with the reason) — so a 300-row import can be read and corrected.
   */
  async importMembers(poolId, rows, actor, { source = 'import' } = {}) {
    const pool = await poolService.getPool(poolId);
    poolService.assertActive(pool, 'take new candidates');
    if (!Array.isArray(rows) || !rows.length) throw new ValidationError('Add at least one email address');
    if (rows.length > 5000) throw new ValidationError('Import at most 5,000 candidates at a time');

    const parsed = rows.map(readRow).map((r) => ({ ...r, email: normalizeEmail(r.email) }));
    const emails = [...new Set(parsed.map((r) => r.email).filter((e) => EMAIL_RE.test(e)))];
    const [existingMembers, users] = await Promise.all([
      models.PoolMember.findAll({ where: { poolId, email: { [Op.in]: emails } }, attributes: ['id', 'email'] }),
      // Accounts are global identities: look the address up across workspaces;
      // the workspace membership check below decides whether we may link it.
      emails.length ? models.User.findAll({ where: { email: { [Op.in]: emails } }, attributes: ['id', 'email', 'firstName', 'lastName'], skipOrganizationScope: true }) : [],
    ]);
    const memberships = users.length ? await models.OrganizationMembership.findAll({
      where: { organizationId: pool.organizationId, userId: { [Op.in]: users.map((u) => u.id) }, status: 'active' },
      attributes: ['userId'],
    }) : [];
    const inPool = new Map(existingMembers.map((m) => [m.email, m.id]));
    const userByEmail = new Map(users.map((u) => [normalizeEmail(u.email), u]));
    const workspaceUserIds = new Set(memberships.map((m) => m.userId));

    let room = Infinity;
    if (pool.capacity) {
      const current = await models.PoolMember.count({
        where: { poolId, [Op.or]: [{ decision: null }, { decision: { [Op.notIn]: ['withdrawn', 'disqualified'] } }] },
      });
      room = Math.max(0, pool.capacity - current);
    }

    const results = [];
    const activated = [];
    const seen = new Set();
    for (const row of parsed) {
      const base = { email: row.email };
      if (!EMAIL_RE.test(row.email)) { results.push({ ...base, result: 'failed', reason: 'Not a valid email address' }); continue; }
      if (seen.has(row.email)) { results.push({ ...base, result: 'skipped', reason: 'Duplicate row in this list' }); continue; }
      seen.add(row.email);
      if (inPool.has(row.email)) { results.push({ ...base, result: 'skipped', reason: 'Already in this pool', memberId: inPool.get(row.email) }); continue; }
      if (room <= 0) { results.push({ ...base, result: 'failed', reason: `The pool is full (capacity ${pool.capacity})` }); continue; }

      const user = userByEmail.get(row.email);
      const linkable = user && workspaceUserIds.has(user.id);
      try {
        const member = await models.PoolMember.create({
          poolId,
          email: row.email,
          applicationId: row.applicationId || null,
          // Carried from the application so work can be aimed at a level.
          // An imported row has none: nobody ever asked that person.
          level: row.level || null,
          userId: linkable ? user.id : null,
          status: linkable ? 'active' : 'invited',
          details: {
            firstName: row.firstName ? String(row.firstName).trim().slice(0, 100) : (user?.firstName || null),
            lastName: row.lastName ? String(row.lastName).trim().slice(0, 100) : (user?.lastName || null),
            source: linkable && source === 'import' ? 'existing' : source,
            activatedAt: linkable ? new Date().toISOString() : null,
          },
        });
        room -= 1;
        inPool.set(row.email, member.id);
        if (linkable) {
          activated.push(member.id);
          results.push({ ...base, result: 'added', reason: 'Existing account added to the pool', memberId: member.id });
        } else {
          const { reused } = await this._ensureInvite(member, pool, actor.id);
          results.push({
            ...base, result: 'invited', memberId: member.id,
            reason: reused ? 'Already holds an invitation — it will also activate this pool' : 'Invitation sent',
          });
        }
      } catch (error) {
        if (error instanceof UniqueConstraintError) {
          results.push({ ...base, result: 'skipped', reason: 'Already in this pool' });
        } else {
          results.push({ ...base, result: 'failed', reason: error.message });
        }
      }
    }

    const summary = { added: 0, invited: 0, skipped: 0, failed: 0 };
    for (const r of results) summary[r.result] += 1;
    await poolService.audit(pool.id, actor.id, 'POOL_MEMBERS_IMPORTED', { source, ...summary });
    if (activated.length) await this.afterActivation(activated, { actorId: actor.id });
    return { summary, results };
  }

  /**
   * The programmes whose applications this actor may bring into the pool: the
   * pool's own (pool.members there is the route's check), plus any other
   * programme where they run intake — a pool can draw from several cohorts of
   * several programmes, but never shows applicants its operator could not see.
   */
  async applicationPrograms(pool, actor, programIds) {
    const authzService = require('./authzService');
    const allowed = new Set([pool.programId]);
    const assignments = await authzService.getAssignments(actor);
    for (const programId of new Set(programIds)) {
      if (allowed.has(programId)) continue;
      if (await authzService.can(actor, P.INTAKE_MANAGE, { programId }, { assignments })) allowed.add(programId);
    }
    return allowed;
  }

  /**
   * Admit accepted (or any) applications into the pool, from any cohort the
   * actor may run intake for. The application itself is left as it is —
   * accepting it would issue a programme invitation and enrol them, which is
   * exactly what the pool exists to postpone.
   */
  async addFromApplications(poolId, applicationIds, actor) {
    const pool = await poolService.getPool(poolId);
    if (!Array.isArray(applicationIds) || !applicationIds.length) throw new ValidationError('Choose at least one application');
    const applications = await models.Application.findAll({
      where: { id: { [Op.in]: applicationIds } },
      include: [{ model: models.Cohort, as: 'cohort', attributes: ['id', 'programId'] }],
    });
    const allowed = await this.applicationPrograms(pool, actor, applications.map((a) => a.cohort?.programId).filter(Boolean));
    if (applications.some((a) => !allowed.has(a.cohort?.programId))) {
      throw new ValidationError('Some of those applications are in a programme whose intake you do not run');
    }
    const rows = applications.map((a) => ({ email: a.email, firstName: a.firstName, lastName: a.lastName, applicationId: a.id, level: a.level || null }));
    const missing = applicationIds.filter((id) => !applications.some((a) => a.id === id));
    const out = await this.importMembers(poolId, rows, actor, { source: 'application' });
    for (const id of missing) out.results.push({ applicationId: id, result: 'failed', reason: 'Application not found' });
    if (missing.length) out.summary.failed += missing.length;
    return out;
  }

  async resendInvite(poolId, memberId, actor) {
    const pool = await poolService.getPool(poolId);
    poolService.assertActive(pool, 'send invitations');
    const member = await this._member(poolId, memberId);
    if (member.userId) throw new ValidationError('This candidate has already activated their account');
    if (member.decision) throw new ValidationError('A decision has been made for this candidate');
    const { invite, reused } = await this._ensureInvite(member, pool, actor.id, { forceNew: true });
    await poolService.audit(pool.id, actor.id, 'POOL_INVITE_RESENT', { memberId: member.id, email: member.email, reused });
    return { member: await member.reload(), expiresAt: invite?.expiresAt || null, reused };
  }

  /**
   * Take someone out of the round: withdrawn (they left) or disqualified (they
   * broke a rule). Needs a reason, which is kept. Their open work is cancelled,
   * which also stops every reminder about it.
   */
  async exit(poolId, memberId, decision, reason, actor) {
    if (!['withdrawn', 'disqualified'].includes(decision)) throw new ValidationError('Unknown decision');
    const text = String(reason || '').trim();
    if (!text) throw new ValidationError(`Give a reason for marking this candidate ${decision}`);
    const pool = await poolService.getPool(poolId);
    const member = await this._member(poolId, memberId);
    if (member.placedAt) {
      throw new ValidationError('This candidate is already placed in a clan — manage them from the clan instead');
    }
    const before = { decision: member.decision, status: member.status };
    const now = new Date();
    await sequelize.transaction(async (transaction) => {
      await member.update({
        decision, decisionReason: text.slice(0, 2000), decidedById: actor.id, decidedAt: now,
        placement: {},
      }, { transaction });
      await models.AssignedTask.scope('withPoolWork').update(
        { status: 'cancelled', cancelledBy: actor.id, cancelledAt: now, cancellationReason: `Candidate ${decision}: ${text}`.slice(0, 2000) },
        { where: { poolMemberId: member.id, status: { [Op.notIn]: ['completed', 'cancelled'] } }, transaction }
      );
      if (member.inviteId && !member.userId) {
        const invite = await models.RegistrationInvite.findByPk(member.inviteId, { transaction });
        // Only our own, unused invitation; a programme invite is not ours to revoke.
        if (invite && invite.metadata?.pool && !invite.usedAt && !invite.revokedAt) {
          await invite.update({ revokedAt: now }, { transaction });
        }
      }
    });
    await poolService.audit(pool.id, actor.id, decision === 'withdrawn' ? 'POOL_MEMBER_WITHDRAWN' : 'POOL_MEMBER_DISQUALIFIED',
      { memberId: member.id, email: member.email, reason: text }, before);
    if (member.userId) {
      await require('./notificationOrchestrator').dispatch({
        eventKey: NOTIFICATION_EVENTS.POOL_OUTCOME,
        recipients: [{ userId: member.userId }],
        payload: {
          title: decision === 'withdrawn' ? `You have been withdrawn from ${pool.name}` : `You have been disqualified from ${pool.name}`,
          message: decision === 'withdrawn'
            ? 'Your place in this selection round has been withdrawn. Your remaining work is no longer due.'
            : 'You are no longer part of this selection round. Your remaining work is no longer due.',
          actionUrl: '/mentee/dashboard',
          actionLabel: 'Open',
          relatedEntityType: 'pool_member_exit',
          relatedEntityId: member.id,
        },
        dedupe: { relatedEntityType: 'pool_member_exit', relatedEntityId: member.id },
      }).catch((e) => console.error('[pool] exit notification failed:', e.message));
    }
    return member.reload();
  }

  /**
   * A score a reviewer enters by hand for a `manual` component — typically an
   * interview held outside Pathment. 0–100, with an optional note.
   */
  /**
   * A hand adjustment to one candidate's points.
   *
   * There used to be a whole parallel scoring lane for this: a component with
   * `source: 'manual'`, carrying a weight, that an operator typed a percentage
   * into. That meant two ways to be worth something, and a candidate's total
   * could not be read off their work.
   *
   * Now there is one number per candidate, added to the points they earned and
   * always shown on its own line. It may be negative — a panel that wants to
   * mark somebody down for something that happened off the platform should be
   * able to, visibly and with a note, rather than by quietly re-rating work.
   */
  async setManualScore(poolId, memberId, { score, note } = {}, actor) {
    const pool = await poolService.getPool(poolId);
    const clearing = score === null || score === undefined || score === '';
    const value = Number(score);
    const limit = MAX_WORK_POINTS;
    if (!clearing && (!Number.isFinite(value) || Math.abs(value) > limit)) {
      throw new ValidationError(`An adjustment must be a number between -${limit} and ${limit} points`);
    }
    const member = await this._member(poolId, memberId);
    if (member.decision) throw new ValidationError('A decision has been made for this candidate — their scores are final');
    if (member.userId && member.userId === actor.id) throw new ValidationError('You cannot score yourself');
    const scores = { ...(member.manualScores || {}) };
    const before = scores[ADJUSTMENT_KEY] || null;
    if (clearing) delete scores[ADJUSTMENT_KEY];
    else {
      scores[ADJUSTMENT_KEY] = {
        score: Math.round(value * 100) / 100,
        note: note ? String(note).slice(0, 2000) : null,
        byId: actor.id,
        at: new Date().toISOString(),
      };
    }
    await member.update({ manualScores: scores });
    await poolService.audit(
      pool.id, actor.id, 'POOL_MANUAL_SCORE_SET',
      { memberId: member.id, adjustment: scores[ADJUSTMENT_KEY]?.score ?? null, note: scores[ADJUSTMENT_KEY]?.note ?? null },
      { adjustment: before?.score ?? null },
    );
    return member;
  }

  /**
   * Link the account that just activated to every pool membership waiting on
   * its email in this workspace. Called inside the registration / invite
   * acceptance transaction — the invitation has just proved the person owns
   * the address. Returns the member ids, so the caller can hand out the pool's
   * work once the transaction has committed.
   */
  async activateForUser(user, { organizationId, transaction } = {}) {
    if (!user?.email || !models.PoolMember) return [];
    const where = { email: normalizeEmail(user.email), userId: null, decision: null };
    if (organizationId) where.organizationId = organizationId;
    const members = await models.PoolMember.findAll({ where, transaction });
    const now = new Date();
    for (const member of members) {
      await member.update({
        userId: user.id, status: 'active', details: { ...(member.details || {}), activatedAt: now.toISOString() },
      }, { transaction });
    }
    return members.map((m) => m.id);
  }

  /** After activation commits: hand out the pool's work where the pool says so. */
  async afterActivation(memberIds, { actorId = null } = {}) {
    const poolTaskService = require('./poolTaskService');
    for (const memberId of memberIds || []) {
      try {
        const member = await models.PoolMember.findByPk(memberId, { include: [{ model: models.CandidatePool, as: 'pool' }] });
        if (!member?.pool || member.pool.settings?.autoAssignOnActivation === false) continue;
        await poolTaskService.assignAllToMember(member.id, { actorId });
      } catch (error) {
        console.error('[pool] auto-assign after activation failed:', error.message);
      }
    }
  }

  /** Is this invitation a pool-only one (no programme, no clan)? */
  isPoolOnlyInvite(invite) {
    return Boolean(invite?.metadata?.pool) && !invite.programId && !invite.clanId;
  }
}

module.exports = new PoolMemberService();
