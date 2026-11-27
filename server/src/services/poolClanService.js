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
const logger = require('../utils/logger');

const OPEN_OR_DONE = ['assigned', 'not_started', 'in_progress', 'revision_needed', 'submitted', 'completed'];

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
    const steps = await linearRoadmapService.getSteps(rule.roadmapId);
    if (!steps.length) return { assigned: 0, reason: 'roadmap_has_no_steps', level: membership.level };

    const wanted = rule.stepIndexes && rule.stepIndexes.length
      ? rule.stepIndexes.filter((i) => i < steps.length)
      : steps.map((_, i) => i);
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
      return await this.assignLevelWork(clanId, userId, { actorId });
    } catch (error) {
      logger.warn('[pool-clan] level work not assigned on join', { clanId, userId, message: error.message });
      return { assigned: 0, reason: 'failed', error: error.message };
    }
  }
}

module.exports = new PoolClanService();
