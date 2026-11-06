/**
 * poolTaskService — qualifying work for the System Pool.
 *
 * Work is the formats Pathment already has: an ordinary task (reading, video,
 * exercise, project, practical, open source…), a quiz kit, an interview
 * kit, or an Edorax course. There is no pool task format.
 *
 * A course is the one kind whose outcome comes from outside Pathment.
 * Assigning it enrolls the candidate on Edorax first and only then creates the
 * task, so a provider refusal (no seats, course withdrawn) costs nothing and
 * is reported per candidate. Cancelling the work releases the seats it took.
 * Nobody hands a course in and nobody reviews it: courseService's background
 * sync reads progress and poolScoringService scores that progress directly.
 *
 * Each piece of work is one entry in the pool's `workItems` list with its own
 * task template (RoadmapTask), and one AssignedTask per member pointing at
 * that template and tagged with `poolMemberId`. The tag keeps it out of every
 * clan screen (the AssignedTask default scope) and routes its review to the
 * pool (authzService.canActOnTask). The template is how a task is traced back
 * to its piece of work, and the partial unique index on
 * (pool_member_id, roadmap_task_id) means the same work reaches the same
 * member once, however many times it is assigned.
 *
 * Assigning deliberately does NOT go through taskService.createCustomTask:
 * that path requires a clan, an enrollment and a mentor, and loosening it
 * would let ordinary work be created without them. This is a separate door
 * into the same tables.
 */
const crypto = require('crypto');
const { Op, UniqueConstraintError } = require('sequelize');
const { models, sequelize } = require('../db');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors/errorTypes');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const { pointsForDifficulty } = require('../config/points');
const logger = require('../utils/logger');
const poolService = require('./poolService');
const poolWorkEvents = require('./poolWorkEvents');

// Task formats that are handed in as text, links and files. Quiz, interview and
// course have runners of their own and are assigned as their own kinds.
const SUBMITTABLE_TYPES = ['reading', 'video', 'exercise', 'project', 'discussion', 'practical', 'assessment', 'custom', 'assignment', 'open_source'];
const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'];
const EST_HOURS = { easy: 2, medium: 4, hard: 8, expert: 12 };
const OPEN_STATUSES = ['assigned', 'not_started', 'in_progress', 'revision_needed'];

const TaskModel = () => models.AssignedTask.scope('withPoolWork');

class PoolTaskService {
  /**
   * The levels a piece of work is aimed at: a clean list of keys, or [] for
   * everyone. Stored as a list rather than a single level because one course
   * often suits two adjacent levels, and because [] reads as "no restriction"
   * without a second flag to mean it.
   */
  _levels(input) {
    if (!Array.isArray(input)) return [];
    return [...new Set(input.map((l) => String(l || '').trim()).filter(Boolean))].slice(0, 20);
  }

  /**
   * Change the pool's work list under a row lock, so two operators editing at
   * the same moment queue up instead of overwriting each other's change.
   */
  async _editWorkItems(poolId, change) {
    return sequelize.transaction(async (transaction) => {
      const pool = await models.CandidatePool.findByPk(poolId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!pool) throw new NotFoundError('Pool not found');
      const items = poolService.workItems(pool);
      const result = await change(items, pool, transaction);
      await pool.update({ workItems: items }, { transaction });
      return result;
    });
  }

  /** The pool's work, each with how far its members have got. */
  async listAssignments(poolId) {
    const pool = await poolService.getPool(poolId);
    const items = poolService.workItems(pool);
    if (!items.length) return [];
    const templates = await models.RoadmapTask.findAll({
      where: { id: { [Op.in]: items.map((w) => w.roadmapTaskId) } },
      attributes: ['id', 'title', 'type', 'difficulty', 'deliverable'],
    });
    const rows = await TaskModel().findAll({
      where: { roadmapTaskId: { [Op.in]: items.map((w) => w.roadmapTaskId) }, poolMemberId: { [Op.ne]: null } },
      include: [{ model: models.PoolMember, as: 'poolMember', attributes: [], where: { poolId }, required: true }],
      attributes: ['roadmapTaskId', 'status'],
      raw: true,
    });
    return items.map((w) => {
      const counts = {};
      for (const r of rows) if (r.roadmapTaskId === w.roadmapTaskId) counts[r.status] = (counts[r.status] || 0) + 1;
      const template = templates.find((t) => t.id === w.roadmapTaskId) || null;
      return {
        ...w,
        // Always a number, even for work added before points existed, so the
        // screens never have to re-derive the curve.
        points: poolService.pointsOf(pool, w, template?.difficulty),
        roadmapTask: template,
        counts,
      };
    });
  }

  /** Validate a kit is ready to hand out. */
  async _kit(kind, kitId) {
    if (!kitId) throw new ValidationError(`Choose a ${kind} to assign`);
    const Kit = kind === 'quiz' ? models.QuizKit : models.InterviewKit;
    const Question = kind === 'quiz' ? models.QuizQuestion : models.InterviewQuestion;
    const kit = await Kit.findByPk(kitId);
    if (!kit) throw new NotFoundError(`That ${kind} does not exist`);
    if (kit.status !== 'published') throw new ValidationError(`Publish this ${kind} before assigning it`);
    if (!(await Question.count({ where: { kitId } }))) throw new ValidationError(`That ${kind} has no questions yet`);
    return kit;
  }

  /**
   * What a piece of work is worth: the number given, or its difficulty's.
   *
   * `0` is a real answer — a warm-up nobody is ranked on — so it is only the
   * absence of a number that falls through to the curve.
   */
  _points(pool, given, difficulty) {
    if (given === null || given === undefined || given === '') {
      return poolService.difficultyPoints(pool)[String(difficulty || 'medium').toLowerCase()]
        ?? poolService.DIFFICULTY_POINTS_DEFAULT.medium;
    }
    const n = Number(given);
    if (!Number.isInteger(n) || n < 0 || n > poolService.MAX_WORK_POINTS) {
      throw new ValidationError(`Points must be a whole number from 0 to ${poolService.MAX_WORK_POINTS}`);
    }
    return n;
  }

  /**
   * Add several roadmap steps as qualifying work in one go.
   *
   * Picking work out of a roadmap is a browsing job — open a roadmap, read its
   * steps, tick the ones that belong in this round — and doing it one request
   * at a time made the operator add five pieces of work by opening the same
   * drawer five times. Steps already in the pool are reported as `skipped`
   * rather than failing the batch, so a second pass over the same roadmap is
   * safe.
   */
  async addRoadmapSteps(poolId, { roadmapTaskIds = [], required = true, levels = [], dueAt = null, points = {}, assignTo = null }, actor) {
    const ids = [...new Set((Array.isArray(roadmapTaskIds) ? roadmapTaskIds : []).map(String))];
    if (!ids.length) throw new ValidationError('Choose at least one roadmap step');
    const pool = await poolService.getPool(poolId);
    poolService.assertActive(pool, 'take new work');
    const steps = await models.RoadmapTask.findAll({ where: { id: { [Op.in]: ids } }, attributes: ['id', 'title', 'type', 'difficulty'] });
    const byId = new Map(steps.map((t) => [t.id, t]));

    const created = [];
    const results = [];
    for (const id of ids) {
      const step = byId.get(id);
      if (!step) { results.push({ roadmapTaskId: id, result: 'failed', reason: 'That roadmap step does not exist' }); continue; }
      if (!SUBMITTABLE_TYPES.includes(step.type)) {
        results.push({ roadmapTaskId: id, result: 'failed', reason: `A ${step.type} step is assigned as its own kind of work` });
        continue;
      }
      try {
        const out = await this.createAssignment(poolId, {
          kind: 'task',
          roadmapTaskId: id,
          required,
          // One level choice applies to every step added in the pass.
          levels,
          dueAt,
          points: points?.[id],
          assignTo,
        }, actor);
        created.push(out.assignment);
        results.push({ roadmapTaskId: id, result: 'added', assignmentId: out.assignment.id, assigned: out.assigned?.summary || null });
      } catch (error) {
        const already = /already part of this pool/i.test(error.message);
        results.push({ roadmapTaskId: id, result: already ? 'skipped' : 'failed', reason: error.message });
      }
    }
    const summary = { added: 0, skipped: 0, failed: 0 };
    for (const r of results) summary[r.result] += 1;
    return { assignments: created, summary, results };
  }

  /**
   * Change what a piece of work is worth, or whether it is required, after it
   * has been added. Points are read at scoring time, so this re-prices work
   * already handed out — which is the point: an operator who mis-set a project
   * should not have to cancel it and issue it again.
   */
  async updateAssignment(poolId, assignmentId, data, actor) {
    const pool = await poolService.getPool(poolId);
    poolService.assertActive(pool, 'change its work');
    if (await poolService.isSelectionConfirmed(poolId)) {
      throw new ValidationError('The selection is confirmed — what the work was worth is now part of the record');
    }
    const template = await (async () => {
      const item = poolService.workItems(pool).find((w) => w.id === assignmentId);
      if (!item) throw new NotFoundError('That work is not part of this pool');
      return models.RoadmapTask.findByPk(item.roadmapTaskId, { attributes: ['difficulty'] });
    })();
    const before = {};
    const assignment = await this._editWorkItems(poolId, (items) => {
      const item = items.find((w) => w.id === assignmentId);
      if (!item) throw new NotFoundError('That work is not part of this pool');
      if (item.cancelledAt) throw new ValidationError('That work was cancelled');
      if (data.points !== undefined) {
        before.points = item.points ?? null;
        item.points = this._points(pool, data.points, template?.difficulty);
      }
      if (data.required !== undefined) {
        before.required = item.required !== false;
        item.required = Boolean(data.required);
      }
      if (data.dueAt !== undefined) {
        const parsed = data.dueAt ? new Date(data.dueAt) : null;
        if (parsed && Number.isNaN(parsed.getTime())) throw new ValidationError('The due date is not a valid date');
        before.dueAt = item.dueAt ?? null;
        item.dueAt = parsed ? parsed.toISOString() : null;
      }
      return item;
    });
    await poolService.audit(pool.id, actor.id, 'POOL_WORK_UPDATED', {
      assignmentId, points: assignment.points, required: assignment.required, dueAt: assignment.dueAt,
    }, before);
    return assignment;
  }

  /**
   * Hand chosen pieces of the pool's work to ONE candidate.
   *
   * The mirror of `assign`, and the half that was missing: the pool could give
   * a piece of work to everybody, but not a piece of work to a person. A round
   * where one candidate needs an extra interview, or joined late and only owes
   * two of the five, had no way to say so.
   */
  async assignToMember(poolId, memberId, { assignmentIds = null } = {}, actor) {
    const pool = await poolService.getPool(poolId);
    poolService.assertActive(pool, 'assign work');
    const member = await models.PoolMember.findOne({ where: { id: memberId, poolId } });
    if (!member) throw new NotFoundError('That candidate is not in this pool');

    const live = poolService.workItems(pool).filter((w) => !w.cancelledAt);
    // No list at all means "everything this pool has" (what activation does);
    // an EMPTY list is somebody's mistake, not a request to hand out five.
    if (Array.isArray(assignmentIds) && !assignmentIds.length) throw new ValidationError('Choose at least one piece of work');
    const wanted = Array.isArray(assignmentIds) ? assignmentIds.map(String) : null;
    const chosen = wanted ? live.filter((w) => wanted.includes(w.id)) : live;
    if (wanted) {
      const missing = wanted.filter((id) => !chosen.some((w) => w.id === id));
      if (missing.length) throw new NotFoundError('Some of that work is not part of this pool');
    }
    if (!chosen.length) throw new ValidationError('This pool has no work to give yet');

    const mentorId = actor?.id || pool.createdById;
    const results = [];
    for (const assignment of chosen) {
      const out = await this._assignOne(pool, assignment, member, mentorId);
      results.push({ ...out, assignmentId: assignment.id, title: assignment.title });
    }
    const summary = { assigned: 0, skipped: 0, failed: 0 };
    for (const r of results) summary[r.result] += 1;
    await poolService.audit(pool.id, actor.id, 'POOL_WORK_ASSIGNED', { memberId: member.id, ...summary });
    return { summary, results };
  }

  /**
   * Create one piece of qualifying work for the pool and, optionally, hand it
   * out straight away.
   *
   *   kind 'task'       { roadmapTaskId } to reuse an existing roadmap step, or
   *                     { title, description, type, difficulty, deliverable,
   *                       acceptanceCriteria } for a one-off special assignment
   *   kind 'quiz'       { kitId, evaluationMode?, timeLimitSeconds?, passScore?, allowRetake?, showAnswers? }
   *   kind 'interview'  { kitId, …interview options }
   *   kind 'course'     { courseId } — an Edorax course the workspace may assign
   *   always            { points?, required?, levels?, dueAt?, assignTo?: 'all' | memberId[] }
   *                     `points` omitted → the step's difficulty, through the pool's curve.
   *                     `levels` omitted or empty → the work is for everyone.
   */
  async createAssignment(poolId, data, actor) {
    const pool = await poolService.getPool(poolId);
    poolService.assertActive(pool, 'take new work');
    const kind = data.kind || 'task';
    if (!models.CandidatePool.WORK_KINDS.includes(kind)) throw new ValidationError(`Unknown kind of work "${kind}"`);

    const dueAt = data.dueAt ? new Date(data.dueAt) : (pool.qualificationDueAt ? new Date(pool.qualificationDueAt) : null);
    if (dueAt && Number.isNaN(dueAt.getTime())) throw new ValidationError('The due date is not a valid date');

    let roadmapTask;
    let title;
    let config = {};
    if (kind === 'task' && data.roadmapTaskId) {
      roadmapTask = await models.RoadmapTask.findByPk(data.roadmapTaskId);
      if (!roadmapTask) throw new NotFoundError('That roadmap step does not exist');
      if (!SUBMITTABLE_TYPES.includes(roadmapTask.type)) {
        throw new ValidationError(`A ${roadmapTask.type} step is assigned through its own kind of work, not as a task`);
      }
      // The template identifies the piece of work, so one step can be used once per pool.
      if (poolService.workItems(pool).some((w) => w.roadmapTaskId === roadmapTask.id && !w.cancelledAt)) {
        throw new ValidationError('That roadmap step is already part of this pool\'s work');
      }
      title = roadmapTask.title;
    } else if (kind === 'task') {
      title = String(data.title || '').trim();
      if (!title) throw new ValidationError('Give the work a title');
      const type = data.type || 'assignment';
      if (!SUBMITTABLE_TYPES.includes(type)) throw new ValidationError(`Unknown task type "${type}"`);
      const difficulty = DIFFICULTIES.includes(data.difficulty) ? data.difficulty : 'medium';
      roadmapTask = await models.RoadmapTask.create({
        title: title.slice(0, 255),
        description: String(data.description || '').trim() || 'No description provided',
        type,
        difficulty,
        taskOrder: 0,
        deliverable: String(data.deliverable || '').trim() || 'Submit your work',
        acceptanceCriteria: Array.isArray(data.acceptanceCriteria)
          ? data.acceptanceCriteria.map((c) => String(c).trim()).filter(Boolean).slice(0, 30)
          : [],
        estimatedHours: EST_HOURS[difficulty],
        isMandatory: false,
        isCustomTask: true,
        pointsBase: pointsForDifficulty(difficulty),
      });
    } else if (kind === 'course') {
      // The course must be one Edorax currently offers this workspace. Taking
      // the id from that list (rather than trusting the client) is the same
      // guard courseService.prepare applies on the clan side.
      const { course: picked } = await require('./courseService').prepare(data.courseId, { checkSeats: false });
      if (poolService.workItems(pool).some((w) => w.kind === 'course' && w.config?.courseId === picked.courseId && !w.cancelledAt)) {
        throw new ValidationError('That course is already part of this pool\'s work');
      }
      title = String(data.title || '').trim() || picked.title;
      config = { courseId: picked.courseId, courseSlug: picked.courseSlug || null, courseTitle: picked.title };
      const difficulty = DIFFICULTIES.includes(data.difficulty) ? data.difficulty : 'medium';
      roadmapTask = await models.RoadmapTask.create({
        title: title.slice(0, 255),
        description: String(data.description || '').trim() || picked.description || 'Complete this course on Edorax.',
        type: 'course',
        difficulty,
        taskOrder: 0,
        deliverable: 'Finish the course on Edorax',
        acceptanceCriteria: [],
        estimatedHours: EST_HOURS[difficulty],
        isMandatory: false,
        isCustomTask: true,
        pointsBase: pointsForDifficulty(difficulty),
      });
    } else {
      const kit = await this._kit(kind, data.kitId);
      title = String(data.title || '').trim() || kit.title || (kind === 'quiz' ? 'Quiz' : 'Interview');
      // Quizzes in a pool default to auto-grading: objective answers need no reviewer.
      const evaluationMode = kind === 'quiz' ? (data.evaluationMode || 'auto') : data.evaluationMode;
      config = { ...(data.options || {}), kitId: kit.id, ...(evaluationMode ? { evaluationMode } : {}) };
      for (const key of ['timeLimitSeconds', 'passScore', 'allowRetake', 'showAnswers', 'shuffleQuestions', 'timingMode', 'totalSeconds']) {
        if (data[key] !== undefined) config[key] = data[key];
      }
      roadmapTask = await models.RoadmapTask.create({
        title: title.slice(0, 255),
        description: String(data.description || '').trim() || (kind === 'quiz' ? 'Complete this quiz.' : 'Complete this interview.'),
        type: kind,
        difficulty: 'medium',
        taskOrder: 0,
        deliverable: kind === 'quiz' ? 'Complete the quiz' : 'Complete the interview',
        acceptanceCriteria: [],
        estimatedHours: 1,
        isMandatory: false,
        isCustomTask: true,
        pointsBase: pointsForDifficulty('medium'),
      });
    }

    const points = this._points(pool, data.points, roadmapTask.difficulty);
    const assignment = await this._editWorkItems(poolId, (items) => {
      const item = {
        id: crypto.randomUUID(),
        kind,
        roadmapTaskId: roadmapTask.id,
        title: title.slice(0, 255),
        // What this piece of work is worth, settled here rather than in a
        // separate table of percentages. Defaults to its difficulty's points.
        points,
        required: data.required !== false,
        levels: this._levels(data.levels),
        dueAt: dueAt ? dueAt.toISOString() : null,
        config,
        createdById: actor.id,
        createdAt: new Date().toISOString(),
        cancelledAt: null,
      };
      items.push(item);
      return item;
    });
    await poolService.audit(pool.id, actor.id, 'POOL_WORK_CREATED', { assignmentId: assignment.id, kind, title: assignment.title, points });

    let assigned = null;
    if (data.assignTo) {
      assigned = await this.assign(poolId, assignment.id, { memberIds: data.assignTo === 'all' ? null : data.assignTo }, actor);
    }
    return { assignment, assigned };
  }

  /**
   * Hand a piece of work to members — everyone active (memberIds null) or a
   * chosen group. Safe to repeat: a member who already holds it is skipped,
   * and the partial unique index makes a concurrent double-assign impossible.
   */
  async assign(poolId, assignmentId, { memberIds = null } = {}, actor) {
    const pool = await poolService.getPool(poolId);
    poolService.assertActive(pool, 'assign work');
    const assignment = poolService.workItems(pool).find((w) => w.id === assignmentId);
    if (!assignment) throw new NotFoundError('That work is not part of this pool');
    if (assignment.cancelledAt) throw new ValidationError('That work was cancelled');

    const where = { poolId };
    if (Array.isArray(memberIds)) {
      if (!memberIds.length) throw new ValidationError('Choose at least one candidate');
      where.id = { [Op.in]: memberIds };
    }
    const members = await models.PoolMember.findAll({ where, order: [['createdAt', 'ASC']] });
    const results = [];
    for (const member of members) {
      results.push(await this._assignOne(pool, assignment, member, actor?.id || assignment.createdById || pool.createdById));
    }
    if (Array.isArray(memberIds)) {
      for (const id of memberIds) {
        if (!members.some((m) => m.id === id)) results.push({ memberId: id, result: 'failed', reason: 'Not a candidate in this pool' });
      }
    }
    const summary = { assigned: 0, skipped: 0, failed: 0 };
    for (const r of results) summary[r.result] += 1;
    if (actor) await poolService.audit(pool.id, actor.id, 'POOL_WORK_ASSIGNED', { assignmentId, ...summary });
    return { summary, results };
  }

  async _assignOne(pool, assignment, member, mentorId) {
    const base = { memberId: member.id, email: member.email };
    // Level targeting is checked before anything else, so aiming work at a
    // level never enrolls the wrong candidate on Edorax or takes their seat.
    if (!poolService.targetsMember(assignment, member)) {
      return {
        ...base,
        result: 'skipped',
        reason: member.level
          ? `This work is for ${assignment.levels.join(', ')}; they applied at ${member.level}`
          : `This work is for ${assignment.levels.join(', ')}; they have no level`,
      };
    }
    if (!member.userId) return { ...base, result: 'skipped', reason: 'Has not activated their account yet — they receive it on activation' };
    if (member.decision) return { ...base, result: 'skipped', reason: `Already ${member.decision.replace('_', ' ')}` };
    const existing = await TaskModel().findOne({
      where: { roadmapTaskId: assignment.roadmapTaskId, poolMemberId: member.id, status: { [Op.ne]: 'cancelled' } },
      attributes: ['id'],
    });
    if (existing) return { ...base, result: 'skipped', reason: 'Already has this work', taskId: existing.id };

    const roadmapTask = await models.RoadmapTask.findByPk(assignment.roadmapTaskId, { attributes: ['id', 'title', 'pointsBase', 'difficulty'] });
    if (!roadmapTask) return { ...base, result: 'failed', reason: 'The work\'s template no longer exists' };

    // A course is resolved against Edorax BEFORE the task row exists, so a
    // refusal (no seats, course pulled, keys rejected) leaves nothing behind
    // and reads as this candidate's failure rather than the whole batch's.
    let coursePrepared = null;
    if (assignment.kind === 'course') {
      try {
        coursePrepared = await require('./courseService').prepare(assignment.config?.courseId);
      } catch (error) {
        return { ...base, result: 'failed', reason: error.isOperational ? error.message : 'Could not reach Edorax' };
      }
    }

    const dueDate = assignment.dueAt || pool.qualificationDueAt || new Date(Date.now() + 7 * 86400000);
    let task;
    try {
      task = await sequelize.transaction(async (transaction) => {
        const created = await models.AssignedTask.create({
          roadmapTaskId: roadmapTask.id,
          menteeId: member.userId,
          mentorId,
          enrollmentId: null,
          clanId: null,
          poolMemberId: member.id,
          status: 'assigned',
          dueDate,
          pointsBase: roadmapTask.pointsBase ?? pointsForDifficulty(roadmapTask.difficulty || 'medium'),
          isCustomTask: true,
        }, { transaction });
        if (assignment.kind === 'quiz') {
          await require('./quizKitService').createAssignmentForTask(
            { assignedTaskId: created.id, kitId: assignment.config.kitId, options: assignment.config }, { transaction }
          );
        } else if (assignment.kind === 'interview') {
          await require('./interviewKitService').createAssignmentForTask(
            { assignedTaskId: created.id, kitId: assignment.config.kitId, options: assignment.config }, { transaction }
          );
        }
        return created;
      });
    } catch (error) {
      if (error instanceof UniqueConstraintError) return { ...base, result: 'skipped', reason: 'Already has this work' };
      return { ...base, result: 'failed', reason: error.message };
    }

    // Enroll outside the transaction: it is an HTTP call to Edorax, and the
    // task's own id is the external assignment id, so it has to exist first.
    // A failure takes the task away again rather than leaving a course task
    // nobody is enrolled in.
    if (coursePrepared) {
      try {
        await require('./courseService').enrollForTask(task, coursePrepared);
      } catch (error) {
        await task.destroy().catch((cleanupError) => {
          logger.error('Pool course task cleanup failed', { taskId: task.id, message: cleanupError.message });
        });
        return { ...base, result: 'failed', reason: error.isOperational ? error.message : 'Could not enroll on Edorax' };
      }
    }

    await poolWorkEvents.refreshMemberStatus(member.id);
    try {
      const due = new Date(dueDate).toUTCString().replace(/ \d\d:\d\d:\d\d GMT$/, '');
      await require('./notificationOrchestrator').dispatch({
        eventKey: NOTIFICATION_EVENTS.POOL_WORK_ASSIGNED,
        recipients: [{ userId: member.userId }],
        payload: {
          title: `New qualifying work: ${assignment.title}`,
          message: `“${assignment.title}” is part of ${pool.name}. Due ${due}.`,
          actionUrl: poolWorkEvents.candidateTaskUrl(task.id),
          actionLabel: 'Open',
          relatedEntityType: 'assigned_task',
          relatedEntityId: task.id,
          emailSubject: `${pool.name}: ${assignment.title}`,
        },
        dedupe: { relatedEntityType: 'pool_work_assigned', relatedEntityId: task.id },
      });
    } catch (error) {
      console.error('[pool] work-assigned notification failed:', error.message);
    }
    return { ...base, result: 'assigned', taskId: task.id };
  }

  /** Everything in the pool that isn't cancelled → this one member (on activation). */
  async assignAllToMember(memberId, { actorId = null } = {}) {
    const member = await models.PoolMember.findByPk(memberId, { include: [{ model: models.CandidatePool, as: 'pool' }] });
    if (!member?.pool || member.pool.status === 'closed' || member.pool.archivedAt) return [];
    const results = [];
    for (const assignment of poolService.workItems(member.pool).filter((w) => !w.cancelledAt)) {
      results.push(await this._assignOne(member.pool, assignment, member, actorId || assignment.createdById || member.pool.createdById));
    }
    return results;
  }

  /** Withdraw a piece of work from the pool: cancels it for everyone who has not finished it. */
  async cancelAssignment(poolId, assignmentId, reason, actor) {
    const now = new Date();
    // Course seats are released before the tasks are cancelled, because once a
    // task is cancelled the enrollment is no longer reachable from it. Best
    // effort per candidate: a provider failure is logged and does not keep the
    // work in the pool, which would be worse — the operator could never remove it.
    const released = await this._releaseCourseSeats(poolId, assignmentId);
    const { assignment, cancelled } = await this._editWorkItems(poolId, async (items, pool, transaction) => {
      const item = items.find((w) => w.id === assignmentId);
      if (!item) throw new NotFoundError('That work is not part of this pool');
      if (item.cancelledAt) return { assignment: item, cancelled: 0 };
      item.cancelledAt = now.toISOString();
      const [count] = await TaskModel().update(
        { status: 'cancelled', cancelledBy: actor.id, cancelledAt: now, cancellationReason: reason ? String(reason).slice(0, 2000) : 'Removed from the pool' },
        {
          where: {
            roadmapTaskId: item.roadmapTaskId,
            status: { [Op.in]: OPEN_STATUSES },
            poolMemberId: { [Op.in]: sequelize.literal(`(SELECT id FROM candidate_pool_members WHERE pool_id = ${sequelize.escape(pool.id)})`) },
          },
          transaction,
        }
      );
      return { assignment: item, cancelled: count };
    });
    await poolService.audit(poolId, actor.id, 'POOL_WORK_CANCELLED', {
      assignmentId, cancelled, reason: reason || null, ...(released === null ? {} : { seatsReleased: released }),
    });
    return assignment;
  }

  /**
   * Give back the Edorax seats a piece of course work is holding. Returns the
   * number released, or null when the work is not a course. Each candidate is
   * released on its own so one provider failure does not strand the rest.
   */
  async _releaseCourseSeats(poolId, assignmentId) {
    const pool = await poolService.getPool(poolId);
    const item = poolService.workItems(pool).find((w) => w.id === assignmentId);
    if (!item || item.kind !== 'course' || item.cancelledAt) return null;
    const tasks = await TaskModel().findAll({
      where: {
        roadmapTaskId: item.roadmapTaskId,
        status: { [Op.in]: OPEN_STATUSES },
        poolMemberId: { [Op.in]: sequelize.literal(`(SELECT id FROM candidate_pool_members WHERE pool_id = ${sequelize.escape(poolId)})`) },
      },
      attributes: ['id'],
    });
    const courseService = require('./courseService');
    let released = 0;
    for (const task of tasks) {
      try {
        await courseService.cancelForTask(task);
        released += 1;
      } catch (error) {
        logger.warn('Pool course seat not released', { taskId: task.id, message: error.message });
      }
    }
    return released;
  }

  /** A candidate opens a task: assigned → in progress (their own pool work only). */
  async startTask(taskId, userId) {
    const task = await TaskModel().findByPk(taskId);
    if (!task || !task.poolMemberId || task.menteeId !== userId) throw new NotFoundError('Task not found');
    await require('./clanLifecycleService').assertTaskWritable(task.id);
    if (['assigned', 'not_started'].includes(task.status)) {
      await task.update({ status: 'in_progress', startedAt: task.startedAt || new Date() });
      await poolWorkEvents.refreshMemberStatus(task.poolMemberId);
    } else if (task.status === 'cancelled') {
      throw new ForbiddenError('This work was cancelled');
    }
    return task;
  }
}

module.exports = new PoolTaskService();
module.exports.SUBMITTABLE_TYPES = SUBMITTABLE_TYPES;
