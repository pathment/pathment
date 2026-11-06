/**
 * poolCandidateService — what a System Pool candidate sees of themselves.
 *
 * Self-only, always keyed on the caller's own user id: their pools, their
 * qualifying work, the feedback on it, and — once decided — their outcome.
 * Never a score, a rank, or anything about another candidate: the round is
 * not a leaderboard.
 */
const { Op } = require('sequelize');
const { models } = require('../db');
const { NotFoundError } = require('../utils/errors/errorTypes');

const TaskModel = () => models.AssignedTask.scope('withPoolWork');

// What a candidate may know about their own decision. Withdrawn/disqualified
// are shown too: they explain why the work stopped.
const VISIBLE_DECISIONS = ['selected', 'waitlisted', 'not_selected', 'withdrawn', 'disqualified'];

class PoolCandidateService {
  async myPools(userId) {
    const members = await models.PoolMember.findAll({
      where: { userId },
      include: [
        { model: models.CandidatePool, as: 'pool', attributes: ['id', 'name', 'description', 'status', 'qualificationDueAt', 'closesAt', 'archivedAt', 'avatarUrl', 'programId'],
          include: [{ model: models.Program, as: 'program', attributes: ['id', 'name'] }] },
        { model: models.Clan, as: 'placedClan', attributes: ['id', 'name'] },
      ],
      order: [['createdAt', 'DESC']],
    });
    const tasks = members.length ? await TaskModel().findAll({
      where: { poolMemberId: { [Op.in]: members.map((m) => m.id) }, status: { [Op.ne]: 'cancelled' } },
      attributes: ['poolMemberId', 'status'],
    }) : [];
    return members.filter((m) => m.pool && !m.pool.archivedAt).map((m) => {
      const mine = tasks.filter((t) => t.poolMemberId === m.id);
      return {
        memberId: m.id,
        pool: {
          id: m.pool.id,
          name: m.pool.name,
          description: m.pool.description,
          status: m.pool.status,
          qualificationDueAt: m.pool.qualificationDueAt,
          // The photo, so a pool looks like a clan in the workspace picker.
          avatarUrl: m.pool.avatarUrl,
          program: m.pool.program,
        },
        progress: {
          total: mine.length,
          completed: mine.filter((t) => t.status === 'completed').length,
          submitted: mine.filter((t) => t.status === 'submitted').length,
          changesRequested: mine.filter((t) => t.status === 'revision_needed').length,
        },
        outcome: VISIBLE_DECISIONS.includes(m.decision) ? {
          decision: m.decision,
          placedClan: m.placedAt ? m.placedClan : null,
        } : null,
      };
    });
  }

  async myTasks(userId) {
    const tasks = await TaskModel().findAll({
      where: { menteeId: userId, poolMemberId: { [Op.ne]: null }, status: { [Op.ne]: 'cancelled' } },
      include: [
        { model: models.RoadmapTask, as: 'roadmapTask', attributes: ['id', 'title', 'type', 'difficulty', 'description', 'estimatedHours'] },
        { model: models.PoolMember, as: 'poolMember', attributes: ['id', 'poolId', 'decision'], required: true, where: { userId },
          include: [{ model: models.CandidatePool, as: 'pool', attributes: ['id', 'name', 'status', 'workItems'] }] },
      ],
      order: [['dueDate', 'ASC'], ['createdAt', 'ASC']],
    });
    return this._withCourses(tasks);
  }

  /**
   * Course work carries its provider facts inline, so the list can show where
   * to go and how far along they are without a second call per row. A course
   * is not handed in, so without this a candidate would see a submit box and
   * no link to the thing they are supposed to do.
   */
  async _withCourses(tasks) {
    const shaped = tasks.map((t) => this._shapeTask(t));
    const courseIds = shaped.filter((s) => s.kind === 'course').map((s) => s.id);
    if (!courseIds.length) return shaped;
    const courseService = require('./courseService');
    const [rows, appUrl] = await Promise.all([
      models.CourseEnrollment.findAll({ where: { assignedTaskId: { [Op.in]: courseIds } } }),
      courseService.status().then((s) => s.appUrl).catch(() => null),
    ]);
    const byTask = new Map(rows.map((r) => [r.assignedTaskId, r]));
    for (const s of shaped) {
      if (s.kind !== 'course') continue;
      const row = byTask.get(s.id);
      s.course = row ? {
        courseTitle: row.courseTitle,
        lifecycle: row.lifecycle,
        progressStatus: row.progressStatus || 'NOT_STARTED',
        overallProgress: row.overallProgress || 0,
        completedLessons: row.completedLessons,
        totalLessons: row.totalLessons,
        appUrl,
      } : null;
    }
    return shaped;
  }

  _shapeTask(t) {
    // The task's piece of work, found through its template on the pool's list.
    const poolService = require('./poolService');
    const pool = t.poolMember?.pool || null;
    const item = pool ? poolService.workItemForTask(pool, t.roadmapTaskId) : null;
    const difficulty = t.roadmapTask?.difficulty || null;
    return {
      id: t.id,
      status: t.status,
      dueDate: t.dueDate,
      isLate: t.isLate,
      submittedAt: t.submittedAt,
      completedAt: t.completedAt,
      kind: item?.kind || 'task',
      required: item?.required ?? true,
      title: t.titleOverride || t.roadmapTask?.title || 'Qualifying work',
      type: t.typeOverride || t.roadmapTask?.type || 'assignment',
      /*
       * The same facts a clan task carries, so one row renders both.
       *
       * `points` is what the work is WORTH, not what anybody earned on it - a
       * candidate is never shown their score or their rank, and this is the
       * brief rather than a result. The list used to carry none of this, which
       * is why a round's work could only be shown as a thin list of titles
       * while a clan's was a proper task row.
       */
      difficulty,
      estimatedHours: t.roadmapTask?.estimatedHours ?? null,
      description: t.descriptionOverride || t.roadmapTask?.description || '',
      points: pool && item ? poolService.pointsOf(pool, item, difficulty) : null,
      pool: t.poolMember?.pool ? { id: t.poolMember.pool.id, name: t.poolMember.pool.name, status: t.poolMember.pool.status } : null,
      readOnly: Boolean(t.poolMember?.decision) || ['closed'].includes(t.poolMember?.pool?.status),
    };
  }

  /** One piece of the caller's own work, with every version handed in and its feedback. */
  async myTask(userId, taskId) {
    const task = await TaskModel().findOne({
      where: { id: taskId, menteeId: userId, poolMemberId: { [Op.ne]: null } },
      include: [
        { model: models.RoadmapTask, as: 'roadmapTask', attributes: ['id', 'title', 'type', 'difficulty', 'description', 'estimatedHours', 'deliverable', 'acceptanceCriteria'],
          include: models.TaskResource ? [{ model: models.TaskResource, as: 'resources', attributes: ['id', 'title', 'url', 'resourceType'], required: false }] : [] },
        { model: models.PoolMember, as: 'poolMember', attributes: ['id', 'poolId', 'decision'], required: true, where: { userId },
          include: [{ model: models.CandidatePool, as: 'pool', attributes: ['id', 'name', 'status', 'workItems'] }] },
      ],
    });
    if (!task) throw new NotFoundError('Task not found');
    const submissions = await models.TaskSubmission.findAll({
      where: { assignedTaskId: task.id },
      include: [
        { model: models.TaskSubmissionFile, as: 'files', attributes: ['id', 'fileName', 'fileUrl', 'fileType', 'fileSizeBytes'] },
        { model: models.TaskFeedback, as: 'feedback', attributes: ['id', 'feedbackText', 'rating', 'isApproved', 'decision', 'revisionNotes', 'checkedCriteria', 'inlineFeedback', 'createdAt'] },
      ],
      order: [['version', 'DESC']],
    });
    const [shaped] = await this._withCourses([task]);
    return {
      ...shaped,
      description: task.descriptionOverride || task.roadmapTask?.description || '',
      deliverable: task.deliverableOverride || task.roadmapTask?.deliverable || '',
      acceptanceCriteria: task.acceptanceCriteriaOverride || task.roadmapTask?.acceptanceCriteria || [],
      resources: task.roadmapTask?.resources || [],
      submissions: submissions.map((s) => ({
        id: s.id,
        version: s.version,
        status: s.status,
        submissionText: s.submissionText,
        submissionUrls: s.submissionUrls,
        // task_submissions has no created_at (timestamps: false).
        submittedAt: s.submittedAt,
        files: s.files,
        // The review itself, but never a number that would amount to a score:
        // the rating is the pool's scoring input, not something to compare.
        feedback: (s.feedback || []).map((f) => ({
          id: f.id, feedbackText: f.feedbackText, isApproved: f.isApproved, decision: f.decision,
          revisionNotes: f.revisionNotes, checkedCriteria: f.checkedCriteria, inlineFeedback: f.inlineFeedback, createdAt: f.createdAt,
        })),
      })),
    };
  }

  /** Throws unless `taskId` is the caller's own pool work. */
  async assertOwnPoolTask(userId, taskId) {
    const task = await TaskModel().findOne({
      where: { id: taskId, menteeId: userId, poolMemberId: { [Op.ne]: null } }, attributes: ['id'],
    });
    if (!task) throw new NotFoundError('Task not found');
    return task;
  }
}

module.exports = new PoolCandidateService();
