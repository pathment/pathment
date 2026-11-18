/**
 * Taking an applicant out of an intake — at any stage, accepted included.
 *
 * An application starts more than a row: an invitation to sign up, a place in
 * every selection pool attached to the intake (with level-targeted work and
 * Edorax course seats), and, once they sign up, a clan, an enrollment and the
 * programme's work. Removing the application undoes all of what it started:
 *
 *   - each pool place the application created is withdrawn — open pool work
 *     cancelled, Edorax seats released, the pool's own invitation revoked
 *     (poolMemberService.exit, the same path as withdrawing by hand);
 *   - an unused sign-up invitation from the acceptance is revoked;
 *   - if they already joined the programme: their mentee place in the
 *     programme's clans ends, open work there is cancelled (seats released),
 *     and the enrollment is marked dropped.
 *
 * Nothing is hard-deleted. The application stays, marked `removed`, so the
 * intake still shows who was removed; who did it, when, why and what was
 * undone are kept in the audit log, and shown on the application.
 *
 * `preview` answers "what will this do?" before anyone confirms.
 */
const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors/errorTypes');

const OPEN_TASK = ['assigned', 'not_started', 'in_progress', 'submitted', 'revision_needed'];
const ACTION = 'intake.application_removed';

class ApplicationRemovalService {
  async _load(applicationId) {
    const app = await models.Application.findByPk(applicationId, {
      include: [{ model: models.Cohort, as: 'cohort' }],
    });
    if (!app) throw new NotFoundError('Application not found');
    return app;
  }

  /** The account the applicant signed up with, if they did. */
  async _userId(app) {
    if (app.userId) return app.userId;
    if (!app.inviteId) return null;
    const invite = await models.RegistrationInvite.findByPk(app.inviteId, { attributes: ['id', 'usedAt', 'email'] });
    if (!invite?.usedAt) return null;
    const user = await models.User.findOne({ where: { email: String(app.email || '').toLowerCase() }, attributes: ['id'] });
    return user?.id || null;
  }

  /** Everything the application started that is still live. */
  async _footprint(app) {
    const cohort = app.cohort;
    const members = await models.PoolMember.findAll({
      where: { applicationId: app.id, [Op.or]: [{ decision: null }, { decision: { [Op.notIn]: ['withdrawn', 'disqualified'] } }] },
      include: [{ model: models.CandidatePool, as: 'pool', attributes: ['id', 'name'] }],
    });
    const pools = [];
    for (const m of members) {
      // eslint-disable-next-line no-await-in-loop
      const openTasks = await models.AssignedTask.scope('withPoolWork').count({
        where: { poolMemberId: m.id, status: { [Op.notIn]: ['completed', 'cancelled'] } },
      });
      pools.push({ memberId: m.id, poolId: m.poolId, poolName: m.pool?.name || 'Pool', openTasks, placed: !!m.placedAt });
    }

    let invite = null;
    if (app.inviteId) {
      const row = await models.RegistrationInvite.findByPk(app.inviteId, { attributes: ['id', 'usedAt', 'revokedAt', 'expiresAt'] });
      if (row && !row.usedAt && !row.revokedAt && new Date(row.expiresAt) > new Date()) invite = { id: row.id };
    }

    const userId = await this._userId(app);
    let programme = null;
    if (userId && cohort?.programId) {
      const clans = await models.Clan.findAll({ where: { programId: cohort.programId }, attributes: ['id', 'name'] });
      const clanIds = clans.map((c) => c.id);
      const memberships = clanIds.length ? await models.ClanMembership.findAll({
        where: { userId, role: 'mentee', status: 'active', clanId: { [Op.in]: clanIds } }, attributes: ['clanId'],
      }) : [];
      const inClans = clans.filter((c) => memberships.some((m) => m.clanId === c.id));
      const openTasks = inClans.length ? await models.AssignedTask.count({
        where: { menteeId: userId, clanId: { [Op.in]: inClans.map((c) => c.id) }, status: { [Op.in]: OPEN_TASK } },
      }) : 0;
      const enrollments = await models.Enrollment.findAll({
        where: { menteeId: userId, programId: cohort.programId, status: { [Op.ne]: 'dropped' } }, attributes: ['id', 'status'],
      });
      programme = {
        userId,
        clans: inClans.map((c) => ({ id: c.id, name: c.name })),
        openTasks,
        enrollments: enrollments.map((e) => ({ id: e.id, status: e.status })),
      };
    }
    return { pools, invite, programme };
  }

  /** What removing this application would undo — shown before confirming. */
  async preview(applicationId) {
    const app = await this._load(applicationId);
    const footprint = await this._footprint(app);
    return {
      application: { id: app.id, status: app.status, email: app.email, name: `${app.firstName || ''} ${app.lastName || ''}`.trim() || app.email },
      alreadyRemoved: app.status === 'removed',
      ...footprint,
    };
  }

  /** Remove the application and undo what it started. `reason` is required and kept. */
  async remove(applicationId, { reason } = {}, actor) {
    const text = String(reason || '').trim();
    if (!text) throw new ValidationError('Say why this applicant is being removed — it is kept on their record.');
    const app = await this._load(applicationId);
    if (app.status === 'removed') throw new ConflictError('This applicant has already been removed.');
    const before = { status: app.status };
    const { pools, invite, programme } = await this._footprint(app);
    const undone = { pools: [], invite: false, clans: [], tasksCancelled: 0, enrollmentsDropped: 0 };
    const now = new Date();

    // 1. Pool places: withdrawn the same way as by hand (work, seats, pool invite).
    const poolMemberService = require('./poolMemberService');
    for (const p of pools) {
      if (p.placed) continue; // placed into a clan from the pool: handled with the programme below
      // eslint-disable-next-line no-await-in-loop
      await poolMemberService.exit(p.poolId, p.memberId, 'withdrawn', `Removed from the intake: ${text}`, actor);
      undone.pools.push({ poolId: p.poolId, poolName: p.poolName, tasksCancelled: p.openTasks });
    }

    // 2. Programme: clans, open work (seats first, while still reachable), enrollment.
    if (programme) {
      const clanIds = programme.clans.map((c) => c.id);
      if (clanIds.length) {
        const tasks = await models.AssignedTask.findAll({
          where: { menteeId: programme.userId, clanId: { [Op.in]: clanIds }, status: { [Op.in]: OPEN_TASK } }, attributes: ['id'],
        });
        const courseService = require('./courseService');
        for (const task of tasks) {
          try {
            // eslint-disable-next-line no-await-in-loop
            await courseService.cancelForTask(task);
          } catch (error) {
            console.warn('[intake] course seat not released on removal:', task.id, error.message);
          }
        }
        undone.tasksCancelled = tasks.length;
      }
      await sequelize.transaction(async (transaction) => {
        if (clanIds.length) {
          await models.AssignedTask.update(
            { status: 'cancelled', cancelledBy: actor.id, cancelledAt: now, cancellationReason: `Removed from the intake: ${text}`.slice(0, 2000) },
            { where: { menteeId: programme.userId, clanId: { [Op.in]: clanIds }, status: { [Op.in]: OPEN_TASK } }, transaction },
          );
          await models.ClanMembership.update(
            { status: 'removed', leftAt: now },
            { where: { userId: programme.userId, role: 'mentee', status: 'active', clanId: { [Op.in]: clanIds } }, transaction },
          );
        }
        if (programme.enrollments.length) {
          await models.Enrollment.update(
            { status: 'dropped' },
            { where: { id: { [Op.in]: programme.enrollments.map((e) => e.id) } }, transaction },
          );
        }
      });
      undone.clans = programme.clans.map((c) => c.name);
      undone.enrollmentsDropped = programme.enrollments.length;
    }

    // 3. The sign-up invitation and the application itself.
    await sequelize.transaction(async (transaction) => {
      if (invite) {
        await models.RegistrationInvite.update({ revokedAt: now }, { where: { id: invite.id, usedAt: null, revokedAt: null }, transaction });
        undone.invite = true;
      }
      await app.update({ status: 'removed', reviewedBy: actor.id, decidedAt: now }, { transaction });
      await models.AuditLog.create({
        organizationId: app.organizationId,
        userId: actor.id,
        action: ACTION,
        entityType: 'Application',
        entityId: app.id,
        oldValues: before,
        newValues: { status: 'removed', reason: text.slice(0, 2000), undone },
      }, { transaction });
    });

    return { application: await app.reload(), undone };
  }

  /** Who removed an application, when and why (the latest removal), or null. */
  async removalFor(applicationId) {
    const row = await models.AuditLog.findOne({
      where: { entityType: 'Application', entityId: applicationId, action: ACTION },
      order: [['created_at', 'DESC']],
    });
    if (!row) return null;
    const by = row.userId ? await models.User.findByPk(row.userId, { attributes: ['firstName', 'lastName', 'email'] }) : null;
    return {
      at: row.createdAt,
      by: by ? (`${by.firstName || ''} ${by.lastName || ''}`.trim() || by.email) : null,
      reason: row.newValues?.reason || null,
      undone: row.newValues?.undone || null,
    };
  }
}

module.exports = new ApplicationRemovalService();
