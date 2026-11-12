/**
 * poolPlacementService — selected candidates into clans.
 *
 * "Selected" and "placed" are different facts. A selection can stand while a
 * placement fails (the clan filled up, it has no lead mentor), so each
 * selected member carries its own placement progress:
 *   placedAt                set only once enrollment AND clan membership exist
 *   placement.status        'pending' | 'failed' (with placement.error)
 *   placement.targetClanId  the planned clan
 *
 * Placement goes through `clanService.addMember` — the normal path, which
 * creates the enrollment, the clan membership and the mentee profile — inside
 * one transaction per person, holding a lock on the clan row so two runs can
 * never squeeze past its capacity. Retrying is always safe: a placed member is
 * skipped, and an existing membership counts as success rather than an error.
 */
const crypto = require('crypto');
const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { ValidationError } = require('../utils/errors/errorTypes');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const poolService = require('./poolService');
const { OPERATIONAL_CLAN_STATUSES, isClanOperational, isClanSuggestable } = require('../config/clanStatus');
const { menteeLoad, pickLeastLoaded, loadReason } = require('./clanDistribution');

class PlacementProblem extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const SEATED = ['active', 'paused'];
// Selected and not placed yet: the people placement works on.
const TO_PLACE = (poolId) => ({ poolId, decision: 'selected', placedAt: null });

class PoolPlacementService {
  /**
   * The clans a pool places into: its target list, else the programme's live
   * cohort clans. Inactive clans are included so an admin can still choose one
   * by hand; the preview never proposes them.
   */
  async _clans(pool, clanIds = null) {
    const ids = clanIds?.length ? clanIds : (pool.settings?.targetClanIds || []);
    const where = { programId: pool.programId };
    if (ids.length) where.id = { [Op.in]: ids };
    else Object.assign(where, { status: { [Op.in]: OPERATIONAL_CLAN_STATUSES }, kind: 'cohort', frozenAt: null });
    return models.Clan.findAll({ where, attributes: ['id', 'name', 'maxMentees', 'status', 'kind', 'frozenAt', 'programId', 'levels'], order: [['name', 'ASC']] });
  }

  async _clanState(clans) {
    if (!clans.length) return new Map();
    const ids = clans.map((c) => c.id);
    const memberships = await models.ClanMembership.findAll({
      where: { clanId: { [Op.in]: ids }, status: { [Op.in]: SEATED } },
      attributes: ['clanId', 'role', 'userId', 'status'],
      include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName'] }],
    });
    const load = await menteeLoad(ids);
    const state = new Map();
    for (const c of clans) {
      const mine = memberships.filter((m) => m.clanId === c.id);
      const lead = mine.find((m) => m.role === 'lead_mentor' && m.status === 'active');
      state.set(c.id, {
        id: c.id,
        name: c.name,
        cap: c.maxMentees || null,
        fill: mine.filter((m) => m.role === 'mentee').length,
        active: load.get(c.id).active,
        paused: load.get(c.id).paused,
        status: c.status || 'active',
        inactive: !isClanSuggestable(c.status),
        levels: Array.isArray(c.levels) ? c.levels : [],
        lead: lead?.user ? { id: lead.user.id, name: `${lead.user.firstName || ''} ${lead.user.lastName || ''}`.trim() } : null,
        coMentorCount: mine.filter((m) => m.role === 'co_mentor' && m.status === 'active').length,
        placeable: isClanOperational(c.status) && c.kind !== 'standing' && !c.frozenAt,
      });
    }
    return state;
  }

  _why(clan) {
    if (!clan.placeable) return 'This clan is not open for placement';
    if (!clan.lead) return 'This clan has no lead mentor';
    return null;
  }

  /**
   * A capacity-aware plan for every selected, not-yet-placed candidate.
   * Nothing is written. Keeps each member's chosen clan when it still has
   * room; otherwise proposes the active clan with the fewest ACTIVE (non-paused)
   * mentees, counting the people already proposed in this run, so one click on
   * "Place" spreads the round evenly. Inactive clans are never proposed.
   *
   * Level first: a clan that serves the candidate's level beats a clan open to
   * any level, which beats a clan for another level (used only when nothing
   * else has room, and said so). Load decides within a tier.
   */
  async preview(poolId, { clanIds = null } = {}) {
    const pool = await poolService.getPool(poolId);
    const clans = await this._clans(pool, clanIds);
    const state = await this._clanState(clans);
    const members = await models.PoolMember.findAll({
      where: TO_PLACE(poolId),
      include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName'] }],
      order: [['rank', 'ASC'], ['createdAt', 'ASC']],
    });
    const planned = new Map([...state.keys()].map((id) => [id, 0]));
    const room = (c) => (c.cap ? c.cap - c.fill - planned.get(c.id) : Infinity);
    const usable = (c) => !this._why(c) && room(c) > 0;
    const rows = members.map((m) => {
      const target = m.placement?.targetClanId || null;
      let clan = target ? state.get(target) : null;
      let reason = clan ? 'Chosen clan' : null;
      if (clan && !usable(clan)) { reason = `${clan.name}: ${this._why(clan) || 'full'} — moved`; clan = null; }
      if (!clan) {
        // planned is passed separately; seated = fill so capacity counts paused seats.
        const open = [...state.values()].filter(usable).map((c) => ({ ...c, seated: c.fill }));
        const tiers = m.level
          ? [
            { list: open.filter((c) => c.levels.includes(m.level)), why: `Serves ${m.level}` },
            { list: open.filter((c) => !c.levels.length), why: 'Open to any level' },
            { list: open, why: `No clan for ${m.level} has room` },
          ]
          : [{ list: open, why: null }];
        for (const tier of tiers) {
          const best = pickLeastLoaded(tier.list, { planned });
          if (!best) continue;
          clan = state.get(best.id);
          const load = loadReason(clan, planned.get(clan.id));
          reason = reason || (tier.why ? `${tier.why} · ${load.charAt(0).toLowerCase()}${load.slice(1)}` : load);
          break;
        }
      }
      if (clan) planned.set(clan.id, planned.get(clan.id) + 1);
      return {
        memberId: m.id, name: models.PoolMember.displayName(m), email: m.email, userId: m.userId,
        currentClanId: target, proposedClanId: clan?.id || null, proposedClanName: clan?.name || null,
        placementStatus: models.PoolMember.placementStatus(m), placementError: m.placement?.error || null,
        reason: clan ? reason : 'No clan has room and a lead mentor',
      };
    });
    const totalRoom = [...state.values()].filter((c) => !this._why(c)).reduce((s, c) => s + (c.cap ? Math.max(0, c.cap - c.fill) : Infinity), 0);
    return {
      clans: [...state.values()].map((c) => ({ ...c, planned: planned.get(c.id), room: c.cap ? Math.max(0, c.cap - c.fill) : null, problem: this._why(c) })),
      // Proposals not yet saved as the plan — the UI applies them in one click.
      suggested: rows.filter((r) => r.proposedClanId && r.proposedClanId !== r.currentClanId).length,
      rows,
      unplaceable: rows.filter((r) => !r.proposedClanId).length,
      insufficientCapacity: Number.isFinite(totalRoom) && totalRoom < rows.length,
    };
  }

  /** Save the chosen clan for each selected candidate (from the preview, edited or not). */
  async setTargets(poolId, targets, actor) {
    const pool = await poolService.getPool(poolId);
    poolService.assertActive(pool, 'plan placements');
    if (!Array.isArray(targets) || !targets.length) throw new ValidationError('Nothing to plan');
    const clanIds = [...new Set(targets.map((t) => t.clanId).filter(Boolean))];
    const clans = clanIds.length ? await models.Clan.findAll({ where: { id: { [Op.in]: clanIds } }, attributes: ['id', 'programId'] }) : [];
    if (clans.length !== clanIds.length || clans.some((c) => c.programId !== pool.programId)) {
      throw new ValidationError('Every clan must belong to the pool\'s programme');
    }
    const members = await models.PoolMember.findAll({ where: { ...TO_PLACE(poolId), id: { [Op.in]: targets.map((t) => t.memberId) } } });
    for (const member of members) {
      const t = targets.find((x) => x.memberId === member.id);
      await member.update({ placement: { ...(member.placement || {}), targetClanId: t.clanId || null } });
    }
    await poolService.audit(pool.id, actor.id, 'POOL_PLACEMENT_PLANNED', { saved: members.length });
    return { saved: members.length };
  }

  /**
   * Place every selected candidate who is not placed yet (or just the ones
   * named). One transaction per person; one failure never stops the others.
   */
  async place(poolId, { memberIds = null } = {}, actor) {
    const pool = await poolService.getPool(poolId);
    poolService.assertActive(pool, 'place candidates');
    const where = TO_PLACE(poolId);
    if (Array.isArray(memberIds)) where.id = { [Op.in]: memberIds };
    const members = await models.PoolMember.findAll({ where, attributes: ['id'], order: [['rank', 'ASC'], ['createdAt', 'ASC']] });
    const results = [];
    for (const { id } of members) results.push(await this._placeOne(pool, id));

    const summary = { placed: 0, alreadyPlaced: 0, failed: 0 };
    for (const r of results) summary[r.result] += 1;
    await poolService.audit(pool.id, actor.id, 'POOL_PLACEMENT_RUN', {
      ...summary, failures: results.filter((r) => r.result === 'failed').map((r) => ({ memberId: r.memberId, code: r.code, reason: r.reason })),
    });
    if (summary.failed) {
      await require('./poolScoringService')._notifyOperators(pool, {
        title: `${pool.name}: ${summary.failed} placement${summary.failed === 1 ? '' : 's'} failed`,
        message: [...new Set(results.filter((r) => r.result === 'failed').map((r) => r.reason))].slice(0, 3).join(' · '),
        relatedEntityId: crypto.randomUUID(),
        dedupeType: 'pool_placement_failed',
        exclude: actor.id,
        tab: 'placement',
      });
    }
    return { summary, results };
  }

  async _placeOne(pool, memberId) {
    const clanService = require('./clanService');
    let outcome;
    try {
      outcome = await sequelize.transaction(async (transaction) => {
        const member = await models.PoolMember.findByPk(memberId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!member) throw new PlacementProblem('missing', 'Candidate not found');
        if (member.placedAt) return { result: 'alreadyPlaced', member };
        if (member.decision !== 'selected') throw new PlacementProblem('not_selected', 'This candidate is not selected');
        if (!member.userId) throw new PlacementProblem('no_account', 'This candidate has not activated their account');
        const targetClanId = member.placement?.targetClanId;
        if (!targetClanId) throw new PlacementProblem('no_clan', 'No clan chosen — plan the placement first');

        const clan = await models.Clan.findByPk(targetClanId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!clan) throw new PlacementProblem('clan_missing', 'The chosen clan no longer exists');
        if (clan.programId !== pool.programId) throw new PlacementProblem('wrong_program', `${clan.name} is in a different programme`);
        // An inactive clan still takes someone the admin chose for it: inactive
        // only keeps the SYSTEM from proposing it.
        if (!isClanOperational(clan.status) || clan.kind === 'standing' || clan.frozenAt) {
          throw new PlacementProblem('clan_closed', `${clan.name} is not open for placement`);
        }
        const lead = await models.ClanMembership.findOne({
          where: { clanId: clan.id, role: 'lead_mentor', status: 'active' }, attributes: ['id'], transaction,
        });
        if (!lead) throw new PlacementProblem('no_mentor', `${clan.name} has no lead mentor`);

        const already = await models.ClanMembership.findOne({
          where: { clanId: clan.id, userId: member.userId, role: 'mentee', status: { [Op.in]: SEATED } },
          attributes: ['id'], transaction,
        });
        if (!already) {
          const seated = await models.ClanMembership.count({
            where: { clanId: clan.id, role: 'mentee', status: { [Op.in]: SEATED } }, transaction,
          });
          if (clan.maxMentees && seated >= clan.maxMentees) {
            throw new PlacementProblem('clan_full', `${clan.name} is full (${seated}/${clan.maxMentees})`);
          }
          // The normal placement: clan membership + enrollment + mentee profile.
          await clanService.addMember(clan.id, { userId: member.userId, role: 'mentee' }, null, { transaction });
        }

        const enrollment = await models.Enrollment.findOne({
          where: { menteeId: member.userId, programId: pool.programId }, transaction,
        });
        if (!enrollment) throw new PlacementProblem('no_enrollment', 'The enrollment was not created');
        const patch = {};
        if (!enrollment.cohortId) {
          // A pool can draw from several cohorts, so the enrollment takes the
          // cohort the candidate applied through — when it is this programme's.
          // (Older pools pinned one cohort; that still wins.)
          let cohortId = pool.cohortId || null;
          if (!cohortId && member.applicationId) {
            const application = await models.Application.findByPk(member.applicationId, {
              attributes: ['id'], include: [{ model: models.Cohort, as: 'cohort', attributes: ['id', 'programId'] }], transaction,
            });
            if (application?.cohort?.programId === pool.programId) cohortId = application.cohort.id;
          }
          if (cohortId) patch.cohortId = cohortId;
        }
        if (['pending_approval', 'pending_match', 'rejected', 'dropped'].includes(enrollment.status)) patch.status = 'active';
        if (Object.keys(patch).length) await enrollment.update(patch, { transaction });

        await member.update({
          placedClanId: clan.id, placedEnrollmentId: enrollment.id, placedAt: new Date(),
          placement: { targetClanId: clan.id, attempts: (member.placement?.attempts || 0) + 1 },
        }, { transaction });
        return { result: 'placed', member, clan };
      });
    } catch (error) {
      const code = error instanceof PlacementProblem ? error.code : 'error';
      const reason = error.message || 'Placement failed';
      // Recorded outside the rolled-back transaction, and never over a success.
      const member = await models.PoolMember.findByPk(memberId).catch(() => null);
      if (member && !member.placedAt) {
        await member.update({
          placement: { ...(member.placement || {}), status: 'failed', error: reason.slice(0, 2000), attempts: (member.placement?.attempts || 0) + 1 },
        }).catch(() => {});
      }
      return { memberId, result: 'failed', code, reason };
    }

    if (outcome.result === 'placed') await this._announce(pool, outcome.member, outcome.clan);
    return { memberId, result: outcome.result, clanId: outcome.clan?.id || outcome.member.placedClanId };
  }

  /** Only after the placement has committed: the candidate and the clan's mentor team hear. */
  async _announce(pool, member, clan) {
    try {
      const user = await models.User.findByPk(member.userId, { attributes: ['id', 'firstName', 'lastName', 'email'] });
      await require('./notificationOrchestrator').dispatch({
        eventKey: NOTIFICATION_EVENTS.POOL_OUTCOME,
        recipients: [{ userId: member.userId }],
        payload: {
          title: `Welcome to ${clan.name}`,
          message: `You were selected in ${pool.name} and placed in ${clan.name}. Your mentors will be in touch.`,
          actionUrl: '/mentee/dashboard',
          actionLabel: 'Go to my dashboard',
          relatedEntityType: 'pool_placement',
          relatedEntityId: member.id,
          emailSubject: `You're in: ${clan.name}`,
        },
        dedupe: { relatedEntityType: 'pool_placement', relatedEntityId: member.id },
      });
      if (user) await require('./authService')._notifyClanMentorsOfNewMentee({ clan: { id: clan.id, name: clan.name }, mentee: user });
    } catch (error) {
      console.error('[pool] placement notification failed:', error.message);
    }
  }
}

module.exports = new PoolPlacementService();
