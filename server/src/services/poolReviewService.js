/**
 * poolReviewService — the review queue for a System Pool.
 *
 * Reviewing itself is the shared engine: `submissionService.reviewSubmission`
 * (decision, rating, feedback, acceptance criteria, request changes), which
 * for pool work requires `pool.review` at the pool's programme. This service
 * only finds the work waiting in ONE pool and makes sure a submission really
 * belongs to the pool the reviewer is acting in.
 */
const { Op } = require('sequelize');
const { models } = require('../db');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors/errorTypes');

const poolService = require('./poolService');

const TaskModel = () => models.AssignedTask.scope('withPoolWork');

class PoolReviewService {
  /** Latest pending version per piece of work in this pool, oldest first. */
  async queue(poolId) {
    const pool = await poolService.getPool(poolId);
    const submissions = await models.TaskSubmission.findAll({
      where: { status: { [Op.in]: ['pending', 'reviewing'] } },
      include: [{
        model: TaskModel(),
        as: 'assignedTask',
        required: true,
        attributes: ['id', 'status', 'dueDate', 'isLate', 'poolMemberId', 'roadmapTaskId', 'currentSubmissionVersion'],
        where: { status: 'submitted' },
        include: [
          { model: models.PoolMember, as: 'poolMember', required: true, where: { poolId }, attributes: ['id', 'email', 'details', 'userId'],
            include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'profilePictureUrl'] }] },
          { model: models.RoadmapTask, as: 'roadmapTask', attributes: ['id', 'title', 'type', 'difficulty'] },
        ],
      }],
      // task_submissions has no created_at (timestamps: false); submitted_at is its clock.
      order: [['submittedAt', 'ASC']],
    });
    const latest = new Map();
    for (const s of submissions) {
      const prev = latest.get(s.assignedTaskId);
      if (!prev || s.version > prev.version) latest.set(s.assignedTaskId, s);
    }
    return [...latest.values()].map((s) => {
      const t = s.assignedTask;
      const m = t.poolMember;
      const item = poolService.workItemForTask(pool, t.roadmapTaskId);
      return {
        submissionId: s.id,
        taskId: t.id,
        version: s.version,
        submittedAt: s.submittedAt,
        isLate: t.isLate,
        kind: item?.kind || 'task',
        title: item?.title || t.roadmapTask?.title,
        // Which piece of the pool's work this is, and what approving it is
        // worth — so the reviewer sees the stake without a second request.
        assignmentId: item?.id || null,
        points: poolService.pointsOf(pool, item, t.roadmapTask?.difficulty),
        required: item ? item.required !== false : true,
        member: { id: m.id, email: m.email, userId: m.userId, name: models.PoolMember.displayName(m), avatarUrl: m.user?.profilePictureUrl || null },
      };
    });
  }

  async _ownedSubmission(poolId, submissionId) {
    const submission = await require('./submissionService').getSubmissionById(submissionId, { includePoolWork: true });
    const memberId = submission.assignedTask?.poolMemberId;
    if (!memberId) throw new NotFoundError('Submission not found in this pool');
    const member = await models.PoolMember.findOne({ where: { id: memberId, poolId }, attributes: ['id', 'userId', 'decision'] });
    if (!member) throw new NotFoundError('Submission not found in this pool');
    return { submission, member };
  }

  /** One submission with the work's brief and every earlier version, for the review panel. */
  async detail(poolId, submissionId) {
    const { submission } = await this._ownedSubmission(poolId, submissionId);
    const task = submission.assignedTask;
    const [history, pool] = await Promise.all([
      models.TaskSubmission.findAll({
        where: { assignedTaskId: task.id },
        include: [
          { model: models.TaskSubmissionFile, as: 'files' },
          { model: models.TaskFeedback, as: 'feedback' },
        ],
        order: [['version', 'DESC']],
      }),
      poolService.getPool(poolId),
    ]);
    const assignment = poolService.workItemForTask(pool, task.roadmapTaskId);
    return {
      submissionId: submission.id,
      task: {
        id: task.id,
        status: task.status,
        kind: assignment?.kind || 'task',
        title: assignment?.title || task.roadmapTask?.title,
        assignmentId: assignment?.id || null,
        points: poolService.pointsOf(pool, assignment, task.roadmapTask?.difficulty),
        required: assignment ? assignment.required !== false : true,
        description: task.roadmapTask?.description,
        deliverable: task.roadmapTask?.deliverable,
        acceptanceCriteria: task.roadmapTask?.acceptanceCriteria || [],
        dueDate: task.dueDate,
        isLate: task.isLate,
      },
      candidate: task.mentee ? { id: task.mentee.id, name: `${task.mentee.firstName || ''} ${task.mentee.lastName || ''}`.trim(), email: task.mentee.email } : null,
      versions: history,
    };
  }

  /**
   * Review a submission in this pool. A rating is required here: it is the
   * number the pool's score is built from, so it must be a reviewer's
   * deliberate choice, never a default.
   */
  async review(poolId, submissionId, body, actor) {
    const { member } = await this._ownedSubmission(poolId, submissionId);
    if (member.userId && member.userId === actor.id) throw new ForbiddenError('You cannot review your own work');
    const rating = Number(body.rating);
    if (body.rating === undefined || body.rating === null || body.rating === '' || !Number.isFinite(rating) || rating < 0 || rating > 5) {
      throw new ValidationError('Give a rating from 0 to 5 — it is what the pool score is built from');
    }
    const decision = body.decision || (body.isApproved ? 'approved' : 'changes');
    if (!['approved', 'approved_notes', 'changes', 'rejected'].includes(decision)) throw new ValidationError('Unknown decision');
    const isApproved = decision === 'approved' || decision === 'approved_notes';
    const feedbackText = String(body.feedbackText || '').trim();
    if (!isApproved && !feedbackText && !String(body.revisionNotes || '').trim()) {
      throw new ValidationError('Say what needs to change so the candidate can act on it');
    }
    await require('./submissionService').reviewSubmission(submissionId, actor.id, {
      rating,
      feedbackText: feedbackText || null,
      inlineFeedback: Array.isArray(body.inlineFeedback) ? body.inlineFeedback : null,
      isApproved,
      decision,
      revisionNotes: body.revisionNotes || null,
      checkedCriteria: Array.isArray(body.checkedCriteria) ? body.checkedCriteria : null,
    });
    return this.detail(poolId, submissionId);
  }
}

module.exports = new PoolReviewService();
