/**
 * poolClanService — a selection round's own half of being a clan.
 *
 * A round (`clans.kind = 'pool'`) is a clan in every way that matters: it has
 * mentors, members, work, review and a group chat, all of which it inherits
 * rather than reimplements. This file holds the one thing an ordinary clan has
 * no use for — **work chosen by the level each member arrived at**.
 *
 * The rule, and the reason for it:
 *
 *   a member gets the work for THEIR level, and nothing else. A member with no
 *   level, or a level this round has no rule for, gets nothing at all — and is
 *   told nothing.
 *
 * That last clause is the whole point. The round this replaces decided who got
 * a piece of work by looking at a list of levels on the work itself, where an
 * empty list meant "everyone" — so work nobody had aimed went to every
 * candidate, and three level-named courses were mailed to people who should
 * have had one. Here the question is asked the other way round: a level either
 * has a rule or it does not, and no rule means no work.
 *
 * Deadlines come from the step's own `dueOffsetDays`, counted from the moment
 * the member joined. "Two weeks for this" therefore means two weeks from THEIR
 * start, not from a date fixed when the round was written — which is what the
 * round needs, because candidates arrive one at a time.
 */
const { models } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');
const { isPoolClan } = require('../config/clanKinds');
const { createAuditLog } = require('../utils/auditContext');
const { TASK_POINTS_BY_DIFFICULTY } = require('../config/points');
const logger = require('../utils/logger');

const OPEN_OR_DONE = ['assigned', 'not_started', 'in_progress', 'revision_needed', 'submitted', 'completed'];
const MAX_WORK_POINTS = 1000;
// What a round proposes when nobody has said otherwise: one place, no
// waitlist. A quota is always a number, so a shortlist can always be drawn.
const SELECTION_DEFAULTS = Object.freeze({ quota: 1, waitlistSize: 0, qualificationDueAt: null });

class PoolClanService {
  /** The rules as stored, cleaned of anything malformed. */
  levelRules(clan) {
    const raw = Array.isArray(clan?.levelRules) ? clan.levelRules : [];
    return raw
      .filter((r) => r && r.level && r.roadmapId)
      .map((r) => ({
        level: String(r.level).trim().slice(0, 40),
        roadmapId: String(r.roadmapId),
        stepIndexes: Array.isArray(r.stepIndexes) && r.stepIndexes.length
          ? [...new Set(r.stepIndexes.map(Number).filter((n) => Number.isInteger(n) && n >= 0))].sort((a, b) => a - b)
          : null,
      }));
  }

  /** The rule for one level, or null when the round has nothing for it. */
  ruleFor(clan, level) {
    if (!level) return null;
    return this.levelRules(clan).find((r) => r.level === level) || null;
  }

  /**
   * Replace a round's level rules.
   *
   * Validates every roadmap exists up front, so a typo cannot leave a level
   * pointing at nothing — which would read, silently, as "this level gets no
   * work" and be indistinguishable from meaning it.
   */
  async setLevelRules(clanId, rules, actor) {
    const clan = await models.Clan.findByPk(clanId);
    if (!clan) throw new NotFoundError('Clan not found');
    if (!isPoolClan(clan)) {
      throw new ValidationError('Only a selection round sets work by level');
    }
    if (!Array.isArray(rules)) throw new ValidationError('Level rules must be a list');

    const clean = [];
    const seen = new Set();
    for (const raw of rules) {
      const level = raw?.level ? String(raw.level).trim() : '';
      if (!level) throw new ValidationError('Every rule needs a level');
      if (seen.has(level)) throw new ValidationError(`There are two rules for ${level}`);
      seen.add(level);
      if (!raw.roadmapId) throw new ValidationError(`Choose the work for ${level}`);
      const roadmap = await models.Roadmap.findByPk(raw.roadmapId, { attributes: ['id'] });
      if (!roadmap) throw new ValidationError(`The work chosen for ${level} no longer exists`);
      clean.push({
        level: level.slice(0, 40),
        roadmapId: roadmap.id,
        stepIndexes: Array.isArray(raw.stepIndexes) && raw.stepIndexes.length ? raw.stepIndexes : null,
      });
    }

    const before = this.levelRules(clan);
    await clan.update({ levelRules: clean });
    await createAuditLog({
      userId: actor?.id || null,
      action: 'POOL_CLAN_LEVEL_RULES_SET',
      entityType: 'Clan',
      entityId: clan.id,
      newValues: { rules: clean },
      oldValues: { rules: before },
    }).catch(() => {});
    return this.levelRules(await clan.reload());
  }

  /**
   * The steps one level is set to do: the rule, the roadmap's steps, and which
   * of them this rule chose. One answer for both callers — handing the work
   * out and scoring it must agree on what the work IS.
   */
  async stepsFor(clan, level) {
    const rule = this.ruleFor(clan, level);
    if (!rule) return null;
    const linearRoadmapService = require('./linearRoadmapService');
    const steps = await linearRoadmapService.getSteps(rule.roadmapId);
    if (!steps.length) return { rule, steps, wanted: [] };
    const wanted = rule.stepIndexes && rule.stepIndexes.length
      ? rule.stepIndexes.filter((i) => i < steps.length)
      : steps.map((_, i) => i);
    return { rule, steps, wanted };
  }

  /** This round's points curve, with any gap filled from the standard one. */
  difficultyPoints(clan) {
    return {
      ...TASK_POINTS_BY_DIFFICULTY,
      ...(clan?.selectionSettings?.scoringPolicy?.difficultyPoints || {}),
    };
  }

  /**
   * What one step is worth here: its difficulty, through this round's curve.
   *
   * Deliberately NOT `pointsBase`. That is the gamification number for
   * programme work and it defaults to 10 on every roadmap step, so preferring
   * it would mean every piece of work in every round scored the same and the
   * round's curve was never consulted — a setting that silently did nothing.
   * Difficulty is the thing an author actually chooses per step.
   */
  pointsOf(clan, step) {
    return this.difficultyPoints(clan)[String(step?.difficulty || 'medium').toLowerCase()]
      ?? TASK_POINTS_BY_DIFFICULTY.medium;
  }

  /**
   * Everything this round can be scored on, flattened across its levels.
   *
   * One entry per step, carrying the levels it is set for. A step two levels
   * share appears once, aimed at both — which is what `targetsMember` reads,
   * so a candidate earns it if it is set for their level and it is marked
   * `not_targeted` for them if it is not.
   */
  async workItems(clan) {
    const byStep = new Map();
    for (const rule of this.levelRules(clan)) {
      // eslint-disable-next-line no-await-in-loop
      const found = await this.stepsFor(clan, rule.level);
      if (!found) continue;
      for (const i of found.wanted) {
        const step = found.steps[i];
        const existing = byStep.get(step.id);
        if (existing) {
          if (!existing.levels.includes(rule.level)) existing.levels.push(rule.level);
          continue;
        }
        byStep.set(step.id, {
          id: step.id,
          roadmapTaskId: step.id,
          title: step.title,
          kind: step.type,
          points: this.pointsOf(clan, step),
          // Every step a level is set to do counts towards that level's total.
          // A round that wants optional work gives it its own level rule.
          required: true,
          levels: [rule.level],
        });
      }
    }
    return [...byStep.values()];
  }

  /** The levels this round aims work at — what `targetsMember` needs to know. */
  roundLevels(clan) {
    return [...new Set(this.levelRules(clan).map((r) => r.level))];
  }

  /** The round's terms, with the defaults filled in. */
  selectionSettings(clan) {
    const stored = clan?.selectionSettings || {};
    const quota = Number.isInteger(Number(stored.quota)) && Number(stored.quota) > 0 ? Number(stored.quota) : SELECTION_DEFAULTS.quota;
    const waitlistSize = Number.isInteger(Number(stored.waitlistSize)) && Number(stored.waitlistSize) >= 0
      ? Number(stored.waitlistSize) : SELECTION_DEFAULTS.waitlistSize;
    return {
      quota,
      waitlistSize,
      qualificationDueAt: stored.qualificationDueAt || null,
      scoringPolicy: { difficultyPoints: this.difficultyPoints(clan) },
    };
  }

  /** Set how many this round takes, and on what curve. */
  async setSelectionSettings(clanId, settings, actor) {
    const clan = await models.Clan.findByPk(clanId);
    if (!clan) throw new NotFoundError('Clan not found');
    if (!isPoolClan(clan)) throw new ValidationError('Only a selection round has a quota');

    const next = { ...(clan.selectionSettings || {}) };
    if (settings.quota !== undefined) {
      const quota = Number(settings.quota);
      if (!Number.isInteger(quota) || quota < 1) throw new ValidationError('The quota is a whole number of places, at least one');
      next.quota = quota;
    }
    if (settings.waitlistSize !== undefined) {
      const size = Number(settings.waitlistSize);
      if (!Number.isInteger(size) || size < 0) throw new ValidationError('The waitlist is a whole number of places, or none');
      next.waitlistSize = size;
    }
    if (settings.qualificationDueAt !== undefined) {
      const due = settings.qualificationDueAt ? new Date(settings.qualificationDueAt) : null;
      if (due && Number.isNaN(due.getTime())) throw new ValidationError('That qualification deadline is not a date');
      next.qualificationDueAt = due ? due.toISOString() : null;
    }
    if (settings.targetClanIds !== undefined) {
      const ids = Array.isArray(settings.targetClanIds) ? [...new Set(settings.targetClanIds.filter(Boolean))] : [];
      if (ids.length) {
        const found = await models.Clan.findAll({ where: { id: ids }, attributes: ['id', 'programId'] });
        if (found.length !== ids.length || found.some((c) => c.programId !== clan.programId)) {
          throw new ValidationError('Every clan this round places into must belong to its programme');
        }
      }
      next.targetClanIds = ids;
    }
    if (settings.scoringPolicy !== undefined) {
      const curve = settings.scoringPolicy?.difficultyPoints || {};
      const clean = {};
      for (const [key, value] of Object.entries(curve)) {
        const points = Number(value);
        if (!Number.isInteger(points) || points < 0 || points > MAX_WORK_POINTS) {
          throw new ValidationError(`"${key}" work must be worth a whole number of points`);
        }
        clean[String(key).toLowerCase()] = points;
      }
      next.scoringPolicy = { difficultyPoints: clean };
    }

    const before = clan.selectionSettings || {};
    await clan.update({ selectionSettings: next });
    await createAuditLog({
      userId: actor?.id || null,
      action: 'POOL_CLAN_SELECTION_SETTINGS_SET',
      entityType: 'Clan',
      entityId: clan.id,
      newValues: next,
      oldValues: before,
    }).catch(() => {});
    return this.selectionSettings(await clan.reload());
  }

  /**
   * Open this candidate's selection record on the round, or keep the one they
   * have in step with where they are.
   *
   * The record is `PoolMember`: a decision, its reason, the confirmed score,
   * the rank and the placement attempt, none of which belongs on a clan
   * membership. It is opened on joining so the round can list who is in the
   * running before anybody has done any work.
   *
   * Only for mentees. A mentor in a round is reviewing it, not in it.
   */
  async ensureSelectionRecord(clanId, userId, { transaction = null } = {}) {
    const clan = await models.Clan.findByPk(clanId, { attributes: ['id', 'kind'], transaction });
    if (!clan || !isPoolClan(clan)) return null;
    const membership = await models.ClanMembership.findOne({
      where: { clanId, userId, role: 'mentee' },
      attributes: ['id', 'level'],
      transaction,
    });
    if (!membership) return null;
    const user = await models.User.findByPk(userId, { attributes: ['id', 'email', 'firstName', 'lastName'], transaction });
    if (!user) return null;

    const existing = await models.PoolMember.findOne({ where: { clanId, userId }, transaction });
    if (existing) {
      const changed = {};
      if (existing.clanMembershipId !== membership.id) changed.clanMembershipId = membership.id;
      // The membership is where the level lives; the record follows it so the
      // ranking is always read against the level they are actually at.
      if ((existing.level || null) !== (membership.level || null)) changed.level = membership.level || null;
      if (Object.keys(changed).length) await existing.update(changed, { transaction });
      return existing;
    }

    return models.PoolMember.create({
      clanId,
      clanMembershipId: membership.id,
      poolId: null,
      userId,
      email: String(user.email).trim().toLowerCase(),
      level: membership.level || null,
      status: 'active',
      details: { firstName: user.firstName, lastName: user.lastName, source: 'application' },
    }, { transaction });
  }

  /**
   * Tie this candidate's selection record to the application they came in on.
   *
   * The record is opened by joining, which knows nothing about an intake, so
   * the link is made by whatever placed them. It is what lets a later change
   * to the application's level reach the round, and what tells placement which
   * intake a selected candidate applied through.
   */
  async linkApplication(clanId, userId, applicationId) {
    if (!applicationId) return 0;
    const [n] = await models.PoolMember.update(
      { applicationId },
      { where: { clanId, userId, applicationId: null } },
    );
    return n;
  }

  /**
   * Hand this member the work for their level.
   *
   * Called when somebody joins a round and whenever their level changes. Safe
   * to run again: a step they already hold is left as it is, so a replayed
   * join never doubles the work or the email.
   *
   * Returns what happened, so a caller can say why somebody got nothing rather
   * than leaving an operator to guess.
   */
  async assignLevelWork(clanId, userId, { actorId = null } = {}) {
    const clan = await models.Clan.findByPk(clanId);
    if (!clan || !isPoolClan(clan)) return { assigned: 0, reason: 'not_a_round' };

    const membership = await models.ClanMembership.findOne({
      where: { clanId, userId, role: 'mentee' },
      attributes: ['id', 'level', 'status'],
    });
    if (!membership) return { assigned: 0, reason: 'not_a_member' };
    if (membership.status !== 'active') return { assigned: 0, reason: 'not_active' };

    // No level, or no rule for it: nothing is assigned and nothing is sent.
    if (!membership.level) return { assigned: 0, reason: 'no_level' };
    const rule = this.ruleFor(clan, membership.level);
    if (!rule) return { assigned: 0, reason: 'no_rule_for_level', level: membership.level };

    const linearRoadmapService = require('./linearRoadmapService');
    const { steps, wanted } = await this.stepsFor(clan, membership.level);
    if (!steps.length) return { assigned: 0, reason: 'roadmap_has_no_steps', level: membership.level };
    if (!wanted.length) return { assigned: 0, reason: 'no_steps_chosen', level: membership.level };

    // Already holding some of it: a replayed join must not hand it out twice.
    const held = await models.AssignedTask.scope('withPoolWork').findAll({
      where: {
        menteeId: userId,
        clanId,
        roadmapTaskId: wanted.map((i) => steps[i].id),
        status: OPEN_OR_DONE,
      },
      attributes: ['roadmapTaskId'],
    });
    const alreadyHeld = new Set(held.map((t) => t.roadmapTaskId));
    const todo = wanted.filter((i) => !alreadyHeld.has(steps[i].id));
    if (!todo.length) return { assigned: 0, reason: 'already_assigned', level: membership.level };

    /*
     * No `dueDate`, deliberately: each step then takes its own
     * `dueOffsetDays`, counted from now — which is the moment this member
     * joined. One shared deadline would give a late arrival less time than an
     * early one for the same piece of work.
     */
    await linearRoadmapService.assignToMentee(
      actorId || clan.leadMentorId || clan.createdBy,
      rule.roadmapId,
      userId,
      todo[0],
      null,
      null,
      todo,
      null,
      clanId,
    );

    return { assigned: todo.length, level: membership.level, roadmapId: rule.roadmapId };
  }

  /**
   * The level a member is at, changed — and their work swapped to match.
   *
   * Work they already hold for the old level is left alone: it is what they
   * have been doing, and taking it back would throw away finished work and
   * release any provider seat behind it. The new level's work is added.
   */
  async setMemberLevel(clanId, userId, level, actor) {
    const clan = await models.Clan.findByPk(clanId);
    if (!clan) throw new NotFoundError('Clan not found');
    if (!isPoolClan(clan)) throw new ValidationError('Only a selection round places members by level');

    const membership = await models.ClanMembership.findOne({ where: { clanId, userId, role: 'mentee' } });
    if (!membership) throw new NotFoundError('That person is not a candidate in this round');

    const next = level ? String(level).trim().slice(0, 40) : null;
    const before = membership.level || null;
    if (before === next) return { membership, assigned: 0, unchanged: true };

    await membership.update({ level: next });
    // The selection record is ranked on the level they are at, so it follows.
    await models.PoolMember.update({ level: next }, { where: { clanId, userId } });
    await createAuditLog({
      userId: actor?.id || null,
      action: 'POOL_CLAN_MEMBER_LEVEL_SET',
      entityType: 'Clan',
      entityId: clan.id,
      newValues: { userId, level: next },
      oldValues: { level: before },
    }).catch(() => {});

    const out = await this.assignLevelWork(clanId, userId, { actorId: actor?.id || null });
    return { membership, ...out };
  }

  /**
   * Fired after somebody is placed into a round. Never allowed to fail the
   * placement itself — a membership that exists with no work yet is a problem
   * an operator can see and fix; a placement that rolled back is not.
   */
  async afterJoin(clanId, userId, { actorId = null } = {}) {
    try {
      // The record first: a candidate with no work yet is still in the running
      // and must be visible to the round, where one with no record is invisible.
      await this.ensureSelectionRecord(clanId, userId);
      return await this.assignLevelWork(clanId, userId, { actorId });
    } catch (error) {
      logger.warn('[pool-clan] level work not assigned on join', { clanId, userId, message: error.message });
      return { assigned: 0, reason: 'failed', error: error.message };
    }
  }
}

module.exports = new PoolClanService();
