/**
 * poolService — the System Pool itself: create and configure a pool, move it
 * through its life, and answer "where is everybody?" for the operator.
 *
 * A pool is bound to a programme, which is the scope every `pool.*`
 * permission is checked at (routes resolve it with `authzService.scopeOfPool`).
 * Members, work, scoring and placement live in their own services:
 *   poolMemberService     candidates in and out
 *   poolTaskService       qualifying work
 *   poolScoringService    scores, shortlist, decisions
 *   poolPlacementService  clans
 *   poolReminderService   reminders
 */
const { Op } = require('sequelize');
const { models } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');
const { createAuditLog } = require('../utils/auditContext');

/**
 * Where a pool may go next. Forward through the round, back to qualifying if
 * reviewing turns up work that needs redoing, and closed from anywhere.
 */
const TRANSITIONS = {
  draft: ['open', 'closed'],
  open: ['qualifying', 'reviewing', 'closed'],
  qualifying: ['open', 'reviewing', 'closed'],
  reviewing: ['qualifying', 'placing', 'closed'],
  placing: ['reviewing', 'closed'],
  closed: [],
};

// Difficulty is the only dial on what a piece of work is worth. Four steps,
// small numbers, the same curve shape as config/points.js.
const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'];
const { TASK_POINTS_BY_DIFFICULTY } = require('../config/points');
const DIFFICULTY_POINTS_DEFAULT = { ...TASK_POINTS_BY_DIFFICULTY };
const MAX_WORK_POINTS = 1000;

// The key a hand adjustment to a candidate's points is stored under on
// PoolMember.manualScores. One per candidate: a single "and this is what the
// panel thought" number, not a second scoring system.
const ADJUSTMENT_KEY = 'adjustment';

const REMINDER_DEFAULTS = {
  enabled: true,
  inviteAfterDays: 3,
  inviteMaxCount: 2,
  dueSoonHours: 48,
  inactivityDays: 5,
  inactivityMaxCount: 2,
};

const SETTINGS_DEFAULTS = {
  autoAssignOnActivation: true,
  waitlistSize: null, // null → as many as the quota
  targetClanIds: [],
  // Automation (see poolAutomationService):
  // applicants to these intake cohorts join the pool by themselves;
  autoAddFromCohortIds: [],
  // and a candidate whose Edorax progress reaches this % is selected (null = off).
  autoSelectAtProgress: null,
};

const int = (value, { min = 0, max = 100000 } = {}) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return NaN;
  return n;
};

const date = (value, label) => {
  if (value === null || value === undefined || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new ValidationError(`${label} is not a valid date`);
  return d;
};

/**
 * A scoring policy is the curve a piece of work takes its points from.
 *
 * It used to be a list of weighted components totalling 100%, which asked an
 * operator to describe a round twice: once as the work they hand out, and
 * again as the percentages that work feeds. The two drifted — a component with
 * no work behind it scored everybody 0 and blocked the shortlist — and the
 * number a candidate earned for a project could not be read off the project.
 *
 * So the policy is now four numbers. A piece of work is worth its difficulty's
 * points, decided when it is added and editable there, and a candidate's score
 * is the points they actually earned. Nothing to reconcile, and the total is
 * still the sum of its visible parts.
 *
 * `components` is deliberately not carried forward. An older pool keeps
 * whatever it stored (the column is untouched by this), and scoring ignores
 * it.
 */
function validateScoringPolicy(policy, { previousVersion = 0, current = {} } = {}) {
  const given = policy?.difficultyPoints && typeof policy.difficultyPoints === 'object'
    ? policy.difficultyPoints
    : {};
  const base = { ...DIFFICULTY_POINTS_DEFAULT, ...(current.difficultyPoints || {}) };
  const difficultyPoints = {};
  for (const difficulty of DIFFICULTIES) {
    const raw = given[difficulty] === undefined ? base[difficulty] : given[difficulty];
    const n = int(raw, { min: 0, max: MAX_WORK_POINTS });
    if (Number.isNaN(n) || n === null) {
      throw new ValidationError(`${difficulty} work must be worth a whole number of points (0 to ${MAX_WORK_POINTS})`);
    }
    difficultyPoints[difficulty] = n;
  }
  if (!Object.values(difficultyPoints).some((n) => n > 0)) {
    throw new ValidationError('At least one difficulty has to be worth some points');
  }
  return { version: previousVersion + 1, mode: 'points', difficultyPoints };
}

function validateReminderPolicy(policy = {}) {
  const out = { ...REMINDER_DEFAULTS };
  if (policy.enabled !== undefined) out.enabled = Boolean(policy.enabled);
  for (const key of ['inviteAfterDays', 'inviteMaxCount', 'inactivityDays', 'inactivityMaxCount']) {
    if (policy[key] === undefined) continue;
    const n = int(policy[key], { min: 0, max: 60 });
    if (Number.isNaN(n)) throw new ValidationError(`Reminder setting ${key} must be a whole number from 0 to 60`);
    out[key] = n ?? REMINDER_DEFAULTS[key];
  }
  if (policy.dueSoonHours !== undefined) {
    const n = int(policy.dueSoonHours, { min: 0, max: 24 * 14 });
    if (Number.isNaN(n)) throw new ValidationError('Reminder setting dueSoonHours must be a whole number of hours (up to 14 days)');
    out.dueSoonHours = n ?? REMINDER_DEFAULTS.dueSoonHours;
  }
  return out;
}

function validateSettings(settings = {}, current = {}) {
  // Pool work never awards points; drop the retired flag if an older pool still stores it.
  const { awardPoints: _retired, ...kept } = current || {};
  const out = { ...SETTINGS_DEFAULTS, ...kept };
  if (settings.autoAssignOnActivation !== undefined) out.autoAssignOnActivation = Boolean(settings.autoAssignOnActivation);
  if (settings.waitlistSize !== undefined) {
    const n = int(settings.waitlistSize, { min: 0 });
    if (Number.isNaN(n)) throw new ValidationError('Waitlist size must be a whole number');
    out.waitlistSize = n;
  }
  if (settings.targetClanIds !== undefined) {
    if (!Array.isArray(settings.targetClanIds)) throw new ValidationError('targetClanIds must be a list');
    out.targetClanIds = [...new Set(settings.targetClanIds.map(String))];
  }
  if (settings.autoAddFromCohortIds !== undefined) {
    if (!Array.isArray(settings.autoAddFromCohortIds)) throw new ValidationError('autoAddFromCohortIds must be a list');
    out.autoAddFromCohortIds = [...new Set(settings.autoAddFromCohortIds.map(String))];
  }
  if (settings.autoSelectAtProgress !== undefined) {
    const n = int(settings.autoSelectAtProgress, { min: 1, max: 100 });
    if (Number.isNaN(n)) throw new ValidationError('The auto-select threshold must be a whole percentage from 1 to 100');
    out.autoSelectAtProgress = n;
  }
  return out;
}

class PoolService {
  constructor() {
    this.TRANSITIONS = TRANSITIONS;
    this.validateScoringPolicy = validateScoringPolicy;
    this.validateReminderPolicy = validateReminderPolicy;
  }

  async _program(programId) {
    const program = programId ? await models.Program.findByPk(programId, { attributes: ['id', 'name'] }) : null;
    if (!program) throw new ValidationError('Choose a programme for this pool');
    return program;
  }

  async _assertCohortInProgram(cohortId, programId) {
    if (!cohortId) return null;
    const cohort = await models.Cohort.findByPk(cohortId, { attributes: ['id', 'programId'] });
    if (!cohort) throw new ValidationError('That cohort does not exist');
    if (cohort.programId !== programId) throw new ValidationError('That cohort belongs to a different programme');
    return cohort;
  }

  async _assertClansInProgram(clanIds, programId) {
    if (!clanIds?.length) return;
    const clans = await models.Clan.findAll({ where: { id: { [Op.in]: clanIds } }, attributes: ['id', 'programId'] });
    if (clans.length !== clanIds.length || clans.some((c) => c.programId !== programId)) {
      throw new ValidationError('Every target clan must belong to the pool\'s programme');
    }
  }

  _fields(data, { creating, pool } = {}) {
    const out = {};
    if (creating || data.name !== undefined) {
      const name = String(data.name || '').trim();
      if (!name) throw new ValidationError('A pool needs a name');
      out.name = name.slice(0, 160);
    }
    if (data.description !== undefined) out.description = data.description ? String(data.description) : null;
    if (creating || data.selectionQuota !== undefined) {
      const quota = int(data.selectionQuota, { min: 1 });
      if (!quota) throw new ValidationError('Say how many candidates the shortlist selects (at least 1)');
      out.selectionQuota = quota;
    }
    if (data.capacity !== undefined) {
      const capacity = int(data.capacity, { min: 1 });
      if (Number.isNaN(capacity)) throw new ValidationError('Capacity must be a whole number of at least 1, or empty for no limit');
      out.capacity = capacity;
    }
    for (const [field, label] of [['opensAt', 'Opening date'], ['closesAt', 'Closing date'], ['qualificationDueAt', 'Qualification deadline']]) {
      if (data[field] !== undefined) out[field] = date(data[field], label);
    }
    const opensAt = out.opensAt !== undefined ? out.opensAt : pool?.opensAt;
    const closesAt = out.closesAt !== undefined ? out.closesAt : pool?.closesAt;
    if (opensAt && closesAt && new Date(closesAt) <= new Date(opensAt)) {
      throw new ValidationError('The closing date must be after the opening date');
    }
    const capacity = out.capacity !== undefined ? out.capacity : pool?.capacity;
    const quota = out.selectionQuota !== undefined ? out.selectionQuota : pool?.selectionQuota;
    if (capacity && quota && quota > capacity) {
      throw new ValidationError('The shortlist cannot select more candidates than the pool can hold');
    }
    return out;
  }

  /** Pools the caller may see. `programIds === null` means every programme. */
  async listPools({ programIds = null, status = null, programId = null } = {}) {
    if (Array.isArray(programIds) && (!programIds.length || (programId && !programIds.includes(programId)))) return [];
    const where = {};
    if (programId) where.programId = programId;
    else if (Array.isArray(programIds)) where.programId = { [Op.in]: programIds };
    if (status === 'archived') where.archivedAt = { [Op.ne]: null };
    else {
      where.archivedAt = null;
      if (status) where.status = status;
    }
    const pools = await models.CandidatePool.findAll({
      where,
      include: [
        { model: models.Program, as: 'program', attributes: ['id', 'name'] },
        { model: models.Cohort, as: 'cohort', attributes: ['id', 'name'] },
      ],
      order: [['createdAt', 'DESC']],
    });
    if (!pools.length) return [];
    const counts = await models.PoolMember.findAll({
      where: { poolId: { [Op.in]: pools.map((p) => p.id) } },
      attributes: ['poolId', 'status', 'decision'],
      raw: true,
    });
    return pools.map((pool) => {
      const mine = counts.filter((c) => c.poolId === pool.id);
      return {
        ...pool.toJSON(),
        memberCount: mine.filter((m) => !['withdrawn', 'disqualified'].includes(m.decision)).length,
        invitedCount: mine.filter((m) => m.status === 'invited' && !m.decision).length,
        selectedCount: mine.filter((m) => m.decision === 'selected').length,
      };
    });
  }

  async getPool(poolId) {
    const pool = await models.CandidatePool.findByPk(poolId, {
      include: [
        { model: models.Program, as: 'program', attributes: ['id', 'name'] },
        { model: models.Cohort, as: 'cohort', attributes: ['id', 'name'] },
        { model: models.User, as: 'createdBy', attributes: ['id', 'firstName', 'lastName'] },
      ],
    });
    if (!pool) throw new NotFoundError('Pool not found');
    return pool;
  }

  async createPool(data, actor) {
    const program = await this._program(data.programId);
    await this._assertCohortInProgram(data.cohortId, program.id);
    const settings = validateSettings(data.settings || {});
    await this._assertClansInProgram(settings.targetClanIds, program.id);
    await this._assertCohortsExist(settings.autoAddFromCohortIds);
    const pool = await models.CandidatePool.create({
      ...this._fields(data, { creating: true }),
      programId: program.id,
      cohortId: data.cohortId || null,
      status: 'draft',
      scoringPolicy: validateScoringPolicy(data.scoringPolicy || {}, { previousVersion: 0 }),
      reminderPolicy: validateReminderPolicy(data.reminderPolicy || {}),
      settings,
      createdById: actor.id,
    });
    await this.audit(pool.id, actor.id, 'POOL_CREATED', { name: pool.name, programId: pool.programId, selectionQuota: pool.selectionQuota });
    await this._applyAutomation(pool, {}, settings);
    return this.getPool(pool.id);
  }

  /**
   * Edit a pool. The programme never changes (it is the permission scope).
   * Changing the scoring policy issues a new policy VERSION; shortlists already
   * generated keep the policy they were made with.
   */
  async updatePool(poolId, data, actor) {
    const pool = await this.getPool(poolId);
    if (pool.status === 'closed') throw new ValidationError('A closed pool cannot be edited');
    if (data.programId && data.programId !== pool.programId) {
      throw new ValidationError('A pool cannot move to another programme');
    }
    const patch = this._fields(data, { pool });
    if (data.cohortId !== undefined) {
      await this._assertCohortInProgram(data.cohortId, pool.programId);
      patch.cohortId = data.cohortId || null;
    }
    if (data.scoringPolicy !== undefined) {
      if (await this.isSelectionConfirmed(poolId)) {
        throw new ValidationError('The scoring policy cannot change after a shortlist has been confirmed');
      }
      patch.scoringPolicy = validateScoringPolicy(data.scoringPolicy, {
        previousVersion: pool.scoringPolicy?.version || 0,
        current: pool.scoringPolicy || {},
      });
    }
    if (data.reminderPolicy !== undefined) patch.reminderPolicy = validateReminderPolicy({ ...pool.reminderPolicy, ...data.reminderPolicy });
    if (data.settings !== undefined) {
      patch.settings = validateSettings(data.settings, pool.settings || {});
      await this._assertClansInProgram(patch.settings.targetClanIds, pool.programId);
      await this._assertCohortsExist(patch.settings.autoAddFromCohortIds);
    }
    const before = {};
    for (const key of Object.keys(patch)) before[key] = pool.get(key);
    await pool.update(patch);
    await this.audit(pool.id, actor.id, 'POOL_UPDATED', { changed: Object.keys(patch) }, before);
    if (patch.settings) await this._applyAutomation(pool, before.settings || {}, patch.settings);
    return this.getPool(pool.id);
  }

  async _assertCohortsExist(cohortIds = []) {
    if (!cohortIds.length) return;
    const found = await models.Cohort.count({ where: { id: { [Op.in]: cohortIds } } });
    if (found !== cohortIds.length) throw new ValidationError('One of those intakes no longer exists');
  }

  /**
   * Switching automation on takes effect now, not only for what happens next:
   * a newly linked intake brings in everyone who already applied, and a new or
   * lowered threshold re-checks everyone already making progress. Both run
   * after the response, best-effort.
   */
  async _applyAutomation(pool, before, after) {
    const automation = require('./poolAutomationService');
    const added = (after.autoAddFromCohortIds || []).filter((id) => !(before.autoAddFromCohortIds || []).includes(id));
    for (const cohortId of added) {
      automation.safely(`backfill intake ${cohortId}`, () => automation.backfillCohort(pool, cohortId));
    }
    if (after.autoSelectAtProgress && after.autoSelectAtProgress !== before.autoSelectAtProgress) {
      automation.safely('auto-select check', () => automation.checkPool(pool.id));
    }
  }

  async setStatus(poolId, status, actor) {
    const pool = await this.getPool(poolId);
    if (pool.archivedAt) throw new ValidationError('This pool is archived');
    const allowed = TRANSITIONS[pool.status] || [];
    if (!allowed.includes(status)) {
      throw new ValidationError(`A ${pool.status} pool cannot move to ${status}${allowed.length ? ` (it can move to ${allowed.join(', ')})` : ''}`);
    }
    const from = pool.status;
    await pool.update({ status });
    await this.audit(pool.id, actor.id, 'POOL_STATUS_CHANGED', { from, to: status });
    return this.getPool(pool.id);
  }

  /**
   * Has a person confirmed the selection? Confirming is what writes the
   * selection decisions, so a member holding one is the record of it.
   */
  async isSelectionConfirmed(poolId) {
    return Boolean(await models.PoolMember.findOne({
      where: { poolId, decision: { [Op.in]: ['selected', 'waitlisted', 'not_selected'] } },
      attributes: ['id'],
    }));
  }

  /** Archive hides a finished (or abandoned draft) pool from the list. */
  async archive(poolId, actor) {
    const pool = await this.getPool(poolId);
    if (!['closed', 'draft'].includes(pool.status)) throw new ValidationError('Close the pool before archiving it');
    await pool.update({ archivedAt: new Date() });
    await this.audit(pool.id, actor.id, 'POOL_ARCHIVED', {});
    return this.getPool(pool.id);
  }

  /**
   * Is the pool accepting this kind of change? Candidates can be added and
   * work assigned while the pool is open through reviewing — never once it is
   * closed or archived.
   */
  assertActive(pool, what = 'change') {
    if (pool.archivedAt || pool.status === 'closed') {
      throw new ValidationError(`This pool is closed — it cannot ${what}`);
    }
  }

  /**
   * One candidate's place in the round, for the operator dashboard. Derived
   * from their work every time, never stored, so it cannot drift.
   */
  bucketOf(member, tasks, { inactivityDays = REMINDER_DEFAULTS.inactivityDays, now = new Date() } = {}) {
    if (member.decision === 'withdrawn' || member.decision === 'disqualified') return 'withdrawn';
    if (!member.userId) return 'invite_pending';
    const live = tasks.filter((t) => t.status !== 'cancelled');
    if (!live.length) return 'not_started';
    const statuses = live.map((t) => t.status);
    if (statuses.every((s) => s === 'completed')) return 'completed';
    if (statuses.includes('revision_needed')) return 'changes_requested';
    if (statuses.includes('submitted')) {
      return statuses.every((s) => s === 'submitted' || s === 'completed') ? 'needs_review' : 'in_progress';
    }
    const lastActivity = Math.max(
      new Date(member.details?.activatedAt || member.createdAt).getTime(),
      ...live.map((t) => new Date(t.updatedAt || t.assignedAt || 0).getTime())
    );
    if (inactivityDays && now.getTime() - lastActivity > inactivityDays * 86400000) return 'stalled';
    if (statuses.some((s) => s === 'in_progress' || s === 'completed')) return 'in_progress';
    return 'not_started';
  }

  /**
   * The pool's work items, each shaped the way the screens read them.
   * `cancelledAt` is kept on the item; callers filter when they want live work.
   */
  workItems(pool) {
    return (Array.isArray(pool.workItems) ? pool.workItems : []).map((w) => ({ ...w }));
  }

  /**
   * Does this piece of work reach this candidate?
   *
   * Work with no `levels` is for everyone, which is what every piece written
   * before levels existed means. Targeted work reaches only candidates who
   * applied at one of those levels; a candidate with no level is never swept
   * into work aimed at one. Lives here because both the service that hands
   * work out and the one that scores it must agree, exactly.
   */
  targetsMember(assignment, member) {
    const levels = Array.isArray(assignment?.levels) ? assignment.levels : [];
    if (!levels.length) return true;
    return Boolean(member?.level) && levels.includes(member.level);
  }

  /** The work item a pool task belongs to — matched on its task template. */
  workItemForTask(pool, roadmapTaskId) {
    const matching = this.workItems(pool).filter((w) => w.roadmapTaskId === roadmapTaskId);
    // A step cancelled and added again has two items; the live one is the answer.
    return matching.find((w) => !w.cancelledAt) || matching[matching.length - 1] || null;
  }

  /**
   * This pool's points curve, with any gap filled from the default.
   *
   * A pool created before points existed has no curve stored, and a round that
   * has already handed work out must not start scoring it 0 — so the default
   * stands in rather than the absence meaning "worth nothing".
   */
  difficultyPoints(pool) {
    return { ...DIFFICULTY_POINTS_DEFAULT, ...(pool?.scoringPolicy?.difficultyPoints || {}) };
  }

  /** What one piece of work is worth. Its own number, or its difficulty's. */
  pointsOf(pool, item, difficulty = null) {
    const own = int(item?.points, { min: 0, max: MAX_WORK_POINTS });
    if (Number.isInteger(own)) return own;
    return this.difficultyPoints(pool)[String(difficulty || 'medium').toLowerCase()]
      ?? DIFFICULTY_POINTS_DEFAULT.medium;
  }

  /** Every member with their bucket and per-work-item status. */
  async dashboard(poolId) {
    const pool = await this.getPool(poolId);
    const [members, tasks] = await Promise.all([
      models.PoolMember.findAll({
        where: { poolId },
        include: [
          { model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'profilePictureUrl'] },
          { model: models.Clan, as: 'placedClan', attributes: ['id', 'name'] },
        ],
        order: [['createdAt', 'ASC']],
      }),
      models.AssignedTask.scope('withPoolWork').findAll({
        where: { poolMemberId: { [Op.ne]: null } },
        include: [{ model: models.PoolMember, as: 'poolMember', attributes: [], where: { poolId }, required: true }],
        attributes: ['id', 'poolMemberId', 'roadmapTaskId', 'status', 'dueDate', 'submittedAt', 'completedAt', 'updatedAt', 'assignedAt', 'isLate'],
      }),
    ]);
    const workItems = this.workItems(pool);
    // The templates carry the difficulty a piece of work falls back to for its
    // points, so every screen reads a number rather than re-deriving the curve.
    const templates = workItems.length ? await models.RoadmapTask.findAll({
      where: { id: { [Op.in]: workItems.map((w) => w.roadmapTaskId) } },
      attributes: ['id', 'difficulty'],
    }) : [];
    const difficultyOf = new Map(templates.map((t) => [t.id, t.difficulty]));
    const assignments = workItems.map((w) => ({
      ...w,
      points: this.pointsOf(pool, w, difficultyOf.get(w.roadmapTaskId)),
      difficulty: difficultyOf.get(w.roadmapTaskId) || null,
    }));
    // Target clans live in each member's placement JSON; name them in one read.
    const targetIds = [...new Set(members.map((m) => m.placement?.targetClanId).filter(Boolean))];
    const targetClans = targetIds.length
      ? new Map((await models.Clan.findAll({ where: { id: { [Op.in]: targetIds } }, attributes: ['id', 'name'] })).map((c) => [c.id, c]))
      : new Map();
    const tasksByMember = new Map();
    for (const t of tasks) {
      if (!tasksByMember.has(t.poolMemberId)) tasksByMember.set(t.poolMemberId, []);
      tasksByMember.get(t.poolMemberId).push(t);
    }
    const invites = await models.RegistrationInvite.findAll({
      where: { id: { [Op.in]: members.map((m) => m.inviteId).filter(Boolean) } },
      attributes: ['id', 'expiresAt', 'usedAt', 'revokedAt'],
    });
    const inviteById = new Map(invites.map((i) => [i.id, i]));
    const inactivityDays = pool.reminderPolicy?.inactivityDays ?? REMINDER_DEFAULTS.inactivityDays;
    const rows = members.map((m) => {
      const mine = tasksByMember.get(m.id) || [];
      const invite = m.inviteId ? inviteById.get(m.inviteId) : null;
      const targetClanId = m.placement?.targetClanId || null;
      return {
        id: m.id,
        email: m.email,
        name: models.PoolMember.displayName(m),
        userId: m.userId,
        // Their photo, so a candidate list reads like every other person list.
        avatarUrl: m.user?.profilePictureUrl || null,
        source: m.details?.source || 'import',
        // The level they applied at, so a list can be read and filtered by it.
        level: m.level || null,
        status: m.status,
        bucket: this.bucketOf(m, mine, { inactivityDays }),
        decision: m.decision,
        decisionReason: m.decisionReason,
        decidedAt: m.decidedAt,
        totalScore: m.totalScore,
        rank: m.rank,
        placementStatus: models.PoolMember.placementStatus(m),
        placementError: m.placedAt ? null : (m.placement?.error || null),
        placedClan: m.placedClan,
        targetClan: targetClanId ? (targetClans.get(targetClanId) || { id: targetClanId, name: 'Unknown clan' }) : null,
        activatedAt: m.details?.activatedAt || null,
        manualScores: m.manualScores,
        invite: invite ? {
          expired: !invite.usedAt && new Date(invite.expiresAt) < new Date(),
          revoked: Boolean(invite.revokedAt),
          expiresAt: invite.expiresAt,
        } : null,
        work: assignments.map((a) => {
          const t = mine.find((x) => x.roadmapTaskId === a.roadmapTaskId && x.status !== 'cancelled');
          return { assignmentId: a.id, taskId: t?.id || null, status: t?.status || null, dueDate: t?.dueDate || null, isLate: Boolean(t?.isLate) };
        }),
      };
    });
    const buckets = {};
    for (const r of rows) buckets[r.bucket] = (buckets[r.bucket] || 0) + 1;
    return { pool, assignments, members: rows, buckets, levels: await this.levelsFor(pool, rows) };
  }

  /**
   * The levels this round can aim work at: the cohort's own list, plus any
   * level the candidates actually carry. The second half matters because a
   * pool can be filled from a CSV or from a cohort that has since changed its
   * levels, and work that cannot be aimed at a level a candidate holds would
   * be a dead option in the picker. Empty list = this round has no levels.
   */
  async levelsFor(pool, memberRows = []) {
    const byKey = new Map();
    if (pool.cohortId && models.Cohort) {
      const cohort = await models.Cohort.findByPk(pool.cohortId, { attributes: ['id', 'levels'] });
      for (const l of (Array.isArray(cohort?.levels) ? cohort.levels : [])) {
        if (l?.key) byKey.set(String(l.key), { key: String(l.key), label: l.label || String(l.key) });
      }
    }
    for (const r of memberRows) {
      if (r.level && !byKey.has(r.level)) byKey.set(r.level, { key: r.level, label: r.level });
    }
    return [...byKey.values()];
  }

  /**
   * The pool's story, newest first. Shortlist snapshots carry the full ranking
   * in the log; the list here keeps only their summary, so the History screen
   * stays light however many candidates the pool holds.
   */
  async history(poolId) {
    const events = await models.AuditLog.findAll({
      where: { entityType: 'CandidatePool', entityId: poolId },
      order: [['createdAt', 'DESC']],
      limit: 500,
      include: models.AuditLog.associations.user
        ? [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName'] }]
        : [],
    });
    return events.map((e) => {
      const json = e.toJSON();
      if (json.newValues?.entries) json.newValues = { ...json.newValues, entries: undefined, entryCount: json.newValues.entries.length };
      return json;
    });
  }

  /** Every pool event is logged against the pool, so one query reads its story. */
  async audit(poolId, userId, action, newValues = {}, oldValues = null) {
    await createAuditLog({
      userId, action, entityType: 'CandidatePool', entityId: poolId, newValues, ...(oldValues ? { oldValues } : {}),
    });
  }

  /**
   * A record that must exist — a shortlist snapshot. Unlike `audit`, which
   * never throws (a lost log line must not break a request), this writes
   * directly and fails loudly: a snapshot that silently went missing would be
   * a selection with no record of what it was based on.
   */
  async snapshot(poolId, userId, action, newValues) {
    const { getRequestContext } = require('../utils/auditContext');
    const ctx = getRequestContext();
    return models.AuditLog.create({
      userId: userId || ctx.userId || null,
      action,
      entityType: 'CandidatePool',
      entityId: poolId,
      newValues,
      ipAddress: ctx.ip || null,
      userAgent: ctx.userAgent || null,
      ...(models.AuditLog.rawAttributes.organizationId ? { organizationId: ctx.organizationId || null } : {}),
    });
  }

  /** Snapshots of one kind for this pool, oldest first. */
  async snapshots(poolId, actions) {
    return models.AuditLog.findAll({
      where: { entityType: 'CandidatePool', entityId: poolId, action: { [Op.in]: actions } },
      order: [['createdAt', 'ASC']],
    });
  }
}

module.exports = new PoolService();
module.exports.REMINDER_DEFAULTS = REMINDER_DEFAULTS;
module.exports.SETTINGS_DEFAULTS = SETTINGS_DEFAULTS;
module.exports.DIFFICULTY_POINTS_DEFAULT = DIFFICULTY_POINTS_DEFAULT;
module.exports.DIFFICULTIES = DIFFICULTIES;
module.exports.MAX_WORK_POINTS = MAX_WORK_POINTS;
module.exports.ADJUSTMENT_KEY = ADJUSTMENT_KEY;
