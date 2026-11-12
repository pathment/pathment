/**
 * poolAutomationService — the hands-off path from intake link to clan.
 *
 *   apply via link ──► auto-added to the selection pool (pool opts in per cohort)
 *        │
 *   assessment in ──► Pathment AI sets their level ──► pool member's level follows
 *        │                                                   │
 *        │                         level-targeted work (Edorax guided labs) is
 *        │                         handed out — and swapped when the level changes
 *        │
 *   Edorax sync (every 15 min) ──► progress ≥ the pool's threshold (e.g. 80%)
 *        │                         ──► auto-selected, candidate + admins told
 *        │
 *   Selection tab ──► level-aware clan suggestion, one click to place
 *
 * Each step is one method here and each is called from the place where its
 * trigger already happens (intake submit, assessment submit, admin level edit,
 * course sync). Every entry point is best-effort: automation must never fail an
 * applicant's request or the Edorax sync, so callers use `safely()`.
 *
 * Who acts: there is no human in an automatic step, so audits and invitations
 * are attributed to the pool's creator — a real admin, and the person who
 * switched the automation on.
 */
const { Op } = require('sequelize');
const crypto = require('crypto');
const { models } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');
const logger = require('../utils/logger');

const OPEN_TASK = ['assigned', 'not_started', 'in_progress', 'revision_needed'];
const LIVE_POOL = (where = {}) => ({ ...where, status: { [Op.ne]: 'closed' }, archivedAt: null });

/** Run an automation step without ever letting it break the caller. */
function safely(label, fn) {
  return Promise.resolve()
    .then(fn)
    .catch((error) => logger.warn(`[pool-automation] ${label} failed`, { message: error.message }));
}

class PoolAutomationService {
  constructor() { this.safely = safely; }

  _systemActor(pool) {
    if (!pool.createdById) throw new ValidationError(`${pool.name} has no creator to act as for automatic steps`);
    return { id: pool.createdById };
  }

  // ── 1. intake → pool ─────────────────────────────────────────────────────

  /** Pools that take this cohort's applicants automatically. */
  async poolsForCohort(cohortId) {
    if (!cohortId) return [];
    const pools = await models.CandidatePool.findAll({ where: LIVE_POOL() });
    return pools.filter((p) => (p.settings?.autoAddFromCohortIds || []).includes(cohortId));
  }

  /**
   * A new (or updated) application lands in every pool that opted in to its
   * cohort. Idempotent: someone already in a pool is skipped by importMembers.
   */
  async onApplication(application) {
    const pools = await this.poolsForCohort(application.cohortId);
    for (const pool of pools) {
      // eslint-disable-next-line no-await-in-loop
      await safely(`auto-add to pool ${pool.id}`, () => require('./poolMemberService').importMembers(pool.id, [{
        email: application.email,
        firstName: application.firstName,
        lastName: application.lastName,
        applicationId: application.id,
        level: application.level || null,
      }], this._systemActor(pool), { source: 'application' }));
    }
  }

  /**
   * Turning auto-add on for a cohort also brings in everyone who already
   * applied, so the switch means "this cohort's applicants are in the pool",
   * not "only the ones after now".
   */
  async backfillCohort(pool, cohortId) {
    const applications = await models.Application.findAll({
      where: { cohortId, status: { [Op.notIn]: ['withdrawn', 'rejected'] } },
      attributes: ['id', 'email', 'firstName', 'lastName', 'level'],
    });
    if (!applications.length) return { added: 0 };
    const out = await require('./poolMemberService').importMembers(pool.id, applications.map((a) => ({
      email: a.email, firstName: a.firstName, lastName: a.lastName, applicationId: a.id, level: a.level || null,
    })), this._systemActor(pool), { source: 'application' });
    return out.summary;
  }

  // ── 2. AI level ──────────────────────────────────────────────────────────

  /**
   * Pathment AI decides the level once there is evidence to decide on (the
   * intake answers, plus the assessment when there is one) and it becomes the
   * applicant's level. The evidence and the applicant's own pick are kept on
   * the application, so an admin can see why and change it.
   */
  async autoLevel(applicationId) {
    const levelRecommendationService = require('./levelRecommendationService');
    const result = await levelRecommendationService.recommendForApplication(applicationId, null);
    if (!result?.recommended || !result.recommendedLevel) return result;
    const application = await models.Application.findByPk(applicationId);
    if (application && application.level !== result.recommendedLevel) {
      await application.update({ level: result.recommendedLevel });
    }
    await this.syncLevelFromApplication(applicationId);
    return result;
  }

  /** The application's level → every undecided pool member made from it. */
  async syncLevelFromApplication(applicationId) {
    const application = await models.Application.findByPk(applicationId, { attributes: ['id', 'level'] });
    if (!application) return;
    const members = await models.PoolMember.findAll({ where: { applicationId, decision: null } });
    for (const member of members) {
      if ((member.level || null) === (application.level || null)) continue;
      // eslint-disable-next-line no-await-in-loop
      await this.setMemberLevel(member, application.level || null, null);
    }
  }

  // ── 3. level → the right work (guided labs) ──────────────────────────────

  /**
   * Change a candidate's level and swap their level-specific work to match:
   * open work aimed at other levels is cancelled (its Edorax seat released),
   * and the work for the new level is handed out. Finished work is never
   * touched — it is a record of what they did.
   */
  async setMemberLevel(memberOrId, level, actor) {
    const member = typeof memberOrId === 'object' ? memberOrId
      : await models.PoolMember.findByPk(memberOrId);
    if (!member) throw new NotFoundError('Candidate not found');
    const poolService = require('./poolService');
    const pool = await poolService.getPool(member.poolId);
    const next = level ? String(level).trim() : null;
    if (next) {
      const known = await poolService.levelsFor(pool, [member]);
      if (known.length && !known.some((l) => l.key === next)) throw new ValidationError('Choose one of this round\'s levels');
    }
    const before = member.level || null;
    if (before === next) return { member, cancelled: 0, assigned: 0 };
    await member.update({ level: next });

    let cancelled = 0;
    let assigned = 0;
    if (member.userId && !member.decision) {
      const items = poolService.workItems(pool).filter((w) => !w.cancelledAt);
      const offLevel = items.filter((w) => !poolService.targetsMember(w, member));
      if (offLevel.length) {
        const TaskModel = models.AssignedTask.scope('withPoolWork');
        const tasks = await TaskModel.findAll({
          where: { poolMemberId: member.id, status: { [Op.in]: OPEN_TASK }, roadmapTaskId: { [Op.in]: offLevel.map((w) => w.roadmapTaskId) } },
        });
        const courseService = require('./courseService');
        for (const task of tasks) {
          // eslint-disable-next-line no-await-in-loop
          await safely('release course seat', () => courseService.cancelForTask(task));
          // eslint-disable-next-line no-await-in-loop
          await task.update({
            status: 'cancelled', cancelledAt: new Date(), cancelledBy: actor?.id || pool.createdById,
            cancellationReason: `Level changed to ${next || 'none'}`,
          });
          cancelled += 1;
        }
      }
      const results = await require('./poolTaskService').assignAllToMember(member.id, { actorId: actor?.id || null });
      assigned = results.filter((r) => r.result === 'assigned').length;
    }
    await poolService.audit(pool.id, actor?.id || pool.createdById, 'POOL_MEMBER_LEVEL_CHANGED',
      { memberId: member.id, level: next, cancelled, assigned, automatic: !actor }, { level: before });
    return { member, cancelled, assigned };
  }

  // ── 4. progress → selected ───────────────────────────────────────────────

  /**
   * A candidate's Edorax progress: the average across their live course work
   * (guided labs) aimed at them. null when they have none.
   */
  async courseProgress(member) {
    const tasks = await models.AssignedTask.scope('withPoolWork').findAll({
      where: { poolMemberId: member.id, status: { [Op.ne]: 'cancelled' } },
      attributes: ['id'],
    });
    if (!tasks.length) return null;
    const rows = await models.CourseEnrollment.findAll({
      where: { assignedTaskId: { [Op.in]: tasks.map((t) => t.id) }, lifecycle: { [Op.ne]: 'CANCELLED' } },
      attributes: ['overallProgress', 'progressStatus'],
    });
    if (!rows.length) return null;
    const pct = rows.map((r) => (r.progressStatus === 'COMPLETED' ? 100 : Number(r.overallProgress) || 0));
    return Math.round(pct.reduce((s, n) => s + n, 0) / pct.length);
  }

  /**
   * The pool's threshold reached → selected, without anyone pressing a
   * button. Undecided candidates only; an admin's decision is never
   * overwritten, and they can still change this one.
   */
  async checkAutoSelect(memberId) {
    const member = await models.PoolMember.findByPk(memberId, { include: [{ model: models.CandidatePool, as: 'pool' }] });
    const pool = member?.pool;
    const threshold = Number(pool?.settings?.autoSelectAtProgress);
    if (!member || !pool || !threshold || member.decision || member.placedAt) return null;
    if (pool.status === 'closed' || pool.archivedAt) return null;
    const progress = await this.courseProgress(member);
    if (progress == null || progress < threshold) return { progress, selected: false };

    // Conditional on still being undecided: two syncs racing select once.
    const [updated] = await models.PoolMember.update({
      decision: 'selected',
      decisionReason: `Reached ${progress}% on their Edorax work (threshold ${threshold}%)`,
      decidedById: null,
      decidedAt: new Date(),
      placement: { status: 'pending', targetClanId: member.placement?.targetClanId || null },
    }, { where: { id: member.id, decision: null, placedAt: null } });
    if (updated !== 1) return { progress, selected: false };

    const poolService = require('./poolService');
    const scoring = require('./poolScoringService');
    await poolService.audit(pool.id, pool.createdById, 'POOL_AUTO_SELECTED', { memberId: member.id, progress, threshold });
    await scoring._notifyOutcomes(pool, { selected: [member.id] });
    const name = models.PoolMember.displayName ? models.PoolMember.displayName(member) : member.email;
    await scoring._notifyOperators(pool, {
      title: `${name} reached ${progress}% and was selected`,
      message: `They passed the ${threshold}% Edorax threshold in ${pool.name}. A clan is suggested on the Selection tab — one click to place.`,
      relatedEntityId: crypto.randomUUID(),
      dedupeType: 'pool_auto_selected',
      tab: 'selection',
    });
    return { progress, selected: true };
  }

  // ── 5. selected → the clan's mentors hear ────────────────────────────────

  /**
   * Tell the mentors of the clan each newly selected candidate is suggested
   * for, so they can get ready before the placement lands. One message per
   * clan per batch, naming who is coming. Uses the same suggestion the admin
   * sees on the Selection tab; a candidate with no suggestible clan is skipped
   * (the admins already hear about that through the placement flow).
   */
  async notifyIncomingMentors(pool, memberIds = []) {
    if (!memberIds.length) return { notified: 0 };
    const preview = await require('./poolPlacementService').preview(pool.id);
    const byClan = new Map();
    for (const row of preview.rows) {
      if (!memberIds.includes(row.memberId) || !row.proposedClanId) continue;
      const list = byClan.get(row.proposedClanId) || { name: row.proposedClanName, people: [] };
      list.people.push(row.name);
      byClan.set(row.proposedClanId, list);
    }
    if (!byClan.size) return { notified: 0 };

    const mentors = await models.ClanMembership.findAll({
      where: { clanId: { [Op.in]: [...byClan.keys()] }, role: { [Op.in]: ['lead_mentor', 'co_mentor'] }, status: 'active' },
      attributes: ['clanId', 'userId'], raw: true,
    });
    const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
    const orchestrator = require('./notificationOrchestrator');
    let notified = 0;
    for (const [clanId, { name, people }] of byClan) {
      const recipients = [...new Set(mentors.filter((m) => m.clanId === clanId).map((m) => m.userId))];
      if (!recipients.length) continue;
      const who = people.length <= 3 ? people.join(', ') : `${people.slice(0, 3).join(', ')} and ${people.length - 3} more`;
      // eslint-disable-next-line no-await-in-loop
      await orchestrator.dispatch({
        eventKey: NOTIFICATION_EVENTS.POOL_INCOMING_MENTEES,
        recipients: recipients.map((userId) => ({ userId })),
        payload: {
          title: people.length === 1 ? `${people[0]} is headed to ${name}` : `${people.length} new mentees headed to ${name}`,
          message: `${who} ${people.length === 1 ? 'was' : 'were'} selected in ${pool.name} and ${people.length === 1 ? 'is' : 'are'} suggested for your clan. You'll be notified again once they're placed.`,
          actionUrl: '/mentor/dashboard',
          actionLabel: 'Open my dashboard',
          emailSubject: people.length === 1 ? `${people[0]} is joining ${name} soon` : `${people.length} new mentees are joining ${name} soon`,
          relatedEntityType: 'pool_incoming_mentees',
          relatedEntityId: crypto.randomUUID(),
        },
      }).catch((e) => logger.warn('[pool-automation] mentor notice failed', { message: e.message }));
      notified += recipients.length;
    }
    return { notified };
  }

  /** Re-check every undecided candidate in a pool (when the threshold is switched on or changed). */
  async checkPool(poolId) {
    const members = await models.PoolMember.findAll({ where: { poolId, decision: null, placedAt: null, userId: { [Op.ne]: null } }, attributes: ['id'] });
    let selected = 0;
    for (const m of members) {
      // eslint-disable-next-line no-await-in-loop
      const r = await this.checkAutoSelect(m.id).catch(() => null);
      if (r?.selected) selected += 1;
    }
    return { checked: members.length, selected };
  }
}

module.exports = new PoolAutomationService();
