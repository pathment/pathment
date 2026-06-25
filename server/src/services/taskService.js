const { models } = require('../db');
const { NotFoundError, ForbiddenError, ValidationError } = require('../utils/errors/errorTypes');
const { Op } = require('sequelize');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const { endOfDayInZone } = require('../utils/timezone');
const authzService = require('./authzService');
const { PERMISSIONS } = require('../config/permissions');
const { pointsForDifficulty } = require('../config/points');

/** Guess a resource's kind from its URL (mirrors the roadmap step normalizer). */
function inferResourceType(url) {
  const u = String(url || '').toLowerCase();
  if (/youtube\.com|youtu\.be/.test(u)) return 'video';
  if (/docs\.google|drive\.google/.test(u)) return 'document';
  if (/github\.com/.test(u)) return 'repo';
  if (/freecodecamp|udemy|coursera|edx|scrimba|course/.test(u)) return 'course';
  return 'link';
}

/** Normalize an incoming resources array → TaskResource field objects. Drops
 *  entries without a URL; caps at 40. Same shape roadmap steps use. */
function normalizeResources(resources) {
  if (!Array.isArray(resources)) return [];
  return resources.map((r, i) => {
    const url = String(r?.url || '').trim();
    if (!url) return null;
    const title = (String(r?.title || r?.label || '').trim() || url).slice(0, 255);
    return {
      title,
      url,
      resourceType: r?.resourceType ? String(r.resourceType).slice(0, 50) : inferResourceType(url),
      description: r?.description ? String(r.description) : null,
      displayOrder: i,
    };
  }).filter(Boolean).slice(0, 40);
}

/**
 * Merge a mentee's per-assignment overrides over the shared RoadmapTask so the
 * mentee/mentor see the tailored copy. Overrides are null by default → roadmap
 * defaults. Keeps the raw *Override fields on the object too, so the mentor edit
 * drawer can read what was customized.
 */
function applyTaskOverrides(taskInstance) {
  if (!taskInstance) return taskInstance;
  const t = typeof taskInstance.toJSON === 'function' ? taskInstance.toJSON() : { ...taskInstance };
  const rt = t.roadmapTask;
  if (rt) {
    const ac = t.acceptanceCriteriaOverride;
    const res = t.resourcesOverride;
    t.roadmapTask = {
      ...rt,
      title: t.titleOverride ?? rt.title,
      description: t.descriptionOverride ?? rt.description,
      deliverable: t.deliverableOverride ?? rt.deliverable,
      acceptanceCriteria: Array.isArray(ac) && ac.length ? ac : rt.acceptanceCriteria,
      resources: Array.isArray(res) ? res : rt.resources,
    };
  }
  t.hasOverrides = !!(t.titleOverride || t.descriptionOverride || t.deliverableOverride
    || (Array.isArray(t.acceptanceCriteriaOverride) && t.acceptanceCriteriaOverride.length)
    || Array.isArray(t.resourcesOverride) || t.mentorNote);

  // Convenience fields for the UI: where the task came from + its effective points.
  const rmName = rt && rt.roadmap ? rt.roadmap.name : null;
  t.source = t.isCustomTask ? 'custom' : 'roadmap';
  t.roadmapName = t.isCustomTask ? null : rmName;
  // Effective points are STANDARD by difficulty (single source of truth). Fall
  // back to a stored base only when difficulty isn't loaded.
  t.points = rt?.difficulty != null
    ? pointsForDifficulty(rt.difficulty)
    : ((t.pointsBase != null ? t.pointsBase : (rt ? rt.pointsBase : null)) ?? null);
  return t;
}

class TaskService {
  /**
   * Deprecated: week-curriculum auto-assignment was removed. Onboarding is now
   * fully mentor-driven (mentor assigns roadmaps + tasks). Kept as a safe no-op
   * so any residual caller does nothing rather than erroring.
   */
  async autoAssignWeekTasks() {
    return { assignedTasks: [] };
  }

  /**
   * Create custom task (mentor creates for specific mentee)
   */
  async createCustomTask(data, mentorId) {
    const {
      menteeId,
      roadmapTaskId, // NEW: If provided, assign existing roadmap task
      trackId, // Optional: personal lane this task belongs to
      title,
      description,
      type,
      difficulty,
      dueDate,
      pointsBase,
      deliverable,
      acceptanceCriteria,
      resources // Optional: learning resources (links) attached to the task
    } = data;
    let { enrollmentId } = data;

    // Resolve the active enrollment if the caller didn't supply one (the assign
    // drawer only knows the mentee). Falls back to most-recent enrollment.
    if (!enrollmentId) {
      const enrollment = await this._activeEnrollmentForMentee(menteeId);
      if (!enrollment) throw new NotFoundError('Mentee has no enrollment to attach this task to');
      enrollmentId = enrollment.id;
    }

    // Verify the mentor is responsible for this mentee - via a legacy 1:1 match
    // OR (the current model) a shared clan where the mentor leads/co-mentors and
    // the mentee is an active member.
    const isMentor = await this._isMentorForMentee(mentorId, menteeId);
    if (!isMentor) {
      throw new ForbiddenError('You are not the mentor for this mentee');
    }

    let roadmapTask;

    // If roadmapTaskId provided, use existing roadmap task
    if (roadmapTaskId) {
      roadmapTask = await models.RoadmapTask.findByPk(roadmapTaskId);
      if (!roadmapTask) {
        throw new NotFoundError('Roadmap task not found');
      }
    } else {
      // Create custom roadmap task (not part of any roadmap - a one-off).
      roadmapTask = await models.RoadmapTask.create({
        title,
        description: description || title || 'No description provided',
        type: type || 'custom',
        difficulty: difficulty || 'medium',
        taskOrder: 0,
        deliverable: deliverable || 'Complete the assigned task',
        acceptanceCriteria: acceptanceCriteria || [],
        estimatedHours: 5,
        isMandatory: false,
        isCustomTask: true,
        // Standard points by difficulty (no hand-typed values).
        pointsBase: pointsForDifficulty(difficulty || 'medium')
      });

      // Attach any learning resources (links) to the one-off task.
      const resRows = normalizeResources(resources);
      if (resRows.length) {
        await models.TaskResource.bulkCreate(resRows.map((r) => ({ ...r, roadmapTaskId: roadmapTask.id })));
      }
    }

    // Create assigned task
    const assignedTask = await models.AssignedTask.create({
      roadmapTaskId: roadmapTask.id,
      menteeId,
      mentorId,
      enrollmentId,
      status: 'assigned',
      dueDate: dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      isCustomTask: roadmapTaskId ? false : true, // Roadmap tasks are not custom
      trackId: trackId || null
    });

    await this.updateEnrollmentTaskStats(enrollmentId);

    const fullTask = await this.getAssignedTaskById(assignedTask.id);

    const mentorUser = await models.User.findByPk(mentorId, { attributes: ['firstName', 'lastName'] });
    const mentorName = mentorUser ? `${mentorUser.firstName} ${mentorUser.lastName}`.trim() : 'Your mentor';
    const mentorFirst = mentorUser?.firstName || 'Your mentor';
    const taskTitle = fullTask.roadmapTask?.title || 'a new task';
    const dueStr = fullTask.dueDate
      ? new Date(fullTask.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : null;

    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.TASK_ASSIGNED,
      recipients: [{ userId: fullTask.menteeId }],
      payload: {
        title: `${mentorFirst} assigned you a task`,
        message: `“${taskTitle}” is now on your list${dueStr ? ` · due ${dueStr}` : ''}. Open it to get started.`,
        actionUrl: `/mentee/tasks/${fullTask.id}`,
        actionLabel: 'Open task',
        relatedEntityType: 'assigned_task',
        relatedEntityId: fullTask.id,
        emailSubject: `New task from ${mentorName}: ${taskTitle}`
      },
      dedupe: {
        relatedEntityType: 'task_assigned',
        relatedEntityId: fullTask.id
      }
    });

    return fullTask;
  }

  /**
   * Is `mentorId` responsible for `menteeId`? True if an active 1:1 match exists,
   * or they share an active clan where the user is lead/co/core mentor and the
   * mentee is an active 'mentee' member (the clan-based model).
   */
  async _isMentorForMentee(mentorId, menteeId) {
    const match = await models.MentorMenteeMatch.findOne({
      where: { mentorId, menteeId, status: 'active' }
    });
    if (match) return true;

    const mentorClans = await models.ClanMembership.findAll({
      where: { userId: mentorId, status: 'active', role: { [Op.in]: ['lead_mentor', 'co_mentor', 'core_team'] } },
      attributes: ['clanId']
    });
    const clanIds = mentorClans.map((c) => c.clanId);
    if (!clanIds.length) return false;

    const menteeMembership = await models.ClanMembership.findOne({
      where: { userId: menteeId, status: 'active', role: 'mentee', clanId: { [Op.in]: clanIds } }
    });
    return Boolean(menteeMembership);
  }

  /** Active enrollment for a mentee (for assign flows that only know the mentee). */
  async _activeEnrollmentForMentee(menteeId) {
    const ACTIVE = ['active', 'matched', 'approved', 'pending_completion', 'level_completed'];
    const enrollments = await models.Enrollment.findAll({ where: { menteeId } });
    return enrollments.find((e) => ACTIVE.includes(e.status))
      || [...enrollments].sort((a, b) => new Date(b.enrolledAt || 0) - new Date(a.enrolledAt || 0))[0]
      || null;
  }

  /**
   * Assign one custom task to many mentees. Per-mentee enrollment is resolved
   * server-side; failures are collected, not fatal (one bad mentee won't sink
   * the batch). Returns { results: [{ menteeId, ok, error? }], assigned }.
   */
  async bulkCreateCustomTasks(data, mentorId) {
    const { menteeIds, ...taskFields } = data;
    if (!Array.isArray(menteeIds) || !menteeIds.length) {
      throw new ValidationError('menteeIds is required');
    }
    const results = [];
    for (const menteeId of menteeIds) {
      try {
        await this.createCustomTask({ ...taskFields, menteeId }, mentorId);
        results.push({ menteeId, ok: true });
      } catch (err) {
        results.push({ menteeId, ok: false, error: err.message });
      }
    }
    return { results, assigned: results.filter((r) => r.ok).length };
  }

  /**
   * Get tasks for a mentee
   */
  async getMenteeTasks(menteeId, filters = {}) {
    const where = { menteeId };
    
    if (filters.status) {
      where.status = filters.status;
    }
    
    if (filters.enrollmentId) {
      where.enrollmentId = filters.enrollmentId;
    }

    if (filters.isCustomTask !== undefined) {
      where.isCustomTask = filters.isCustomTask;
    }

    const rows = await models.AssignedTask.findAll({
      where,
      include: [
        {
          model: models.RoadmapTask,
          as: 'roadmapTask',
          include: [{ model: models.Roadmap, as: 'roadmap', attributes: ['id', 'name'] }]
        },
        {
          model: models.User,
          as: 'mentor',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: models.Enrollment,
          as: 'enrollment',
          include: [
            { model: models.Program, as: 'program' }
          ]
        },
        {
          model: models.TaskSubmission,
          as: 'submissions',
          separate: true,
          order: [['version', 'DESC']],
          limit: 1,
          // Feedback (notes/rating) + extension fields live on the submission;
          // the cohort-review screen reads them, so include them here too.
          include: [
            {
              model: models.TaskFeedback,
              as: 'feedback'
            }
          ]
        },
        {
          model: models.Track,
          as: 'track',
          attributes: ['id', 'name', 'color']
        }
      ],
      order: [
        ['dueDate', 'ASC'],
        ['assignedAt', 'DESC']
      ]
    });
    return rows.map(applyTaskOverrides);
  }

  /**
   * Get tasks for a mentor (to review)
   */
  async getMentorTasks(mentorId, filters = {}) {
    const where = { mentorId };
    
    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.enrollmentId) {
      where.enrollmentId = filters.enrollmentId;
    }

    if (filters.menteeId) {
      where.menteeId = filters.menteeId;
    }

    // For pending review, get submitted tasks
    if (filters.pendingReview) {
      where.status = 'submitted';
    }

    const rows = await models.AssignedTask.findAll({
      where,
      include: [
        {
          model: models.RoadmapTask,
          as: 'roadmapTask',
          include: [{ model: models.Roadmap, as: 'roadmap', attributes: ['id', 'name'] }]
        },
        {
          model: models.User,
          as: 'mentee',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: models.Enrollment,
          as: 'enrollment',
          include: [
            { model: models.Program, as: 'program' }
          ]
        },
        {
          model: models.TaskSubmission,
          as: 'submissions',
          separate: true,
          order: [['version', 'DESC']],
          limit: 1,
          include: [
            {
              model: models.TaskFeedback,
              as: 'feedback'
            }
          ]
        }
      ],
      order: [
        ['submittedAt', 'DESC'],
        ['dueDate', 'ASC']
      ]
    });
    return rows.map(applyTaskOverrides);
  }

  /**
   * Get single assigned task by ID
   */
  async getAssignedTaskById(taskId) {
    const task = await models.AssignedTask.findByPk(taskId, {
      include: [
        {
          model: models.RoadmapTask,
          as: 'roadmapTask',
          include: [
            {
              model: models.TaskResource,
              as: 'resources'
            },
            { model: models.Roadmap, as: 'roadmap', attributes: ['id', 'name'] }
          ]
        },
        {
          model: models.User,
          as: 'mentee',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: models.User,
          as: 'mentor',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: models.Enrollment,
          as: 'enrollment',
          include: [
            { model: models.Program, as: 'program' }
          ]
        },
        {
          model: models.TaskSubmission,
          as: 'submissions',
          separate: true,
          order: [['version', 'DESC']],
          include: [
            {
              model: models.TaskFeedback,
              as: 'feedback',
              include: [
                {
                  model: models.User,
                  as: 'mentor',
                  attributes: ['id', 'firstName', 'lastName']
                }
              ]
            },
            {
              model: models.TaskSubmissionFile,
              as: 'files'
            }
          ]
        }
      ]
    });

    if (!task) {
      throw new NotFoundError('Task not found');
    }

    return applyTaskOverrides(task);
  }

  /**
   * Submit task
   */
  async submitTask(taskId, menteeId, submissionData) {
    const task = await models.AssignedTask.findByPk(taskId);

    if (!task) {
      throw new NotFoundError('Task not found');
    }

    if (task.menteeId !== menteeId) {
      throw new ForbiddenError('This task is not assigned to you');
    }

    if (task.status === 'completed') {
      throw new ValidationError('Task is already completed');
    }

    // Create submission
    const version = task.currentSubmissionVersion + 1;
    const submission = await models.TaskSubmission.create({
      assignedTaskId: taskId,
      version,
      submissionText: submissionData.submissionText,
      submissionUrls: submissionData.submissionUrls || []
    });

    // Update task status
    const taskUpdate = {
      status: 'submitted',
      submittedAt: new Date(),
      currentSubmissionVersion: version,
      startedAt: task.startedAt || new Date(),
      isLate: task.dueDate && new Date() > new Date(task.dueDate)
    };

    // Accumulate self-reported work hours across resubmissions
    if (submissionData.timeSpentHours && Number(submissionData.timeSpentHours) > 0) {
      const existing = parseFloat(task.timeSpentHours) || 0;
      taskUpdate.timeSpentHours = existing + Number(submissionData.timeSpentHours);
    }

    await task.update(taskUpdate);

    return this.getAssignedTaskById(taskId);
  }

  /**
   * Review task submission
   */
  async reviewTask(taskId, mentorId, reviewData) {
    const task = await models.AssignedTask.findByPk(taskId, {
      include: [
        {
          model: models.TaskSubmission,
          as: 'submissions',
          order: [['version', 'DESC']],
          limit: 1
        }
      ]
    });

    if (!task) {
      throw new NotFoundError('Task not found');
    }

    if (!(await authzService.canActOnTask(mentorId, task, PERMISSIONS.TASK_REVIEW))) {
      throw new ForbiddenError('You do not have permission to review this task');
    }

    if (task.status !== 'submitted') {
      throw new ValidationError('Task is not in submitted state');
    }

    const latestSubmission = task.submissions[0];
    if (!latestSubmission) {
      throw new ValidationError('No submission found');
    }

    const { rating, feedback, status, pointsAwarded } = reviewData;

    // Create feedback
    await models.TaskFeedback.create({
      assignedTaskId: taskId,
      submissionId: latestSubmission.id,
      reviewerId: mentorId,
      rating: rating || 0,
      comments: feedback,
      feedbackType: status === 'completed' ? 'approval' : 'revision',
      isPositive: status === 'completed'
    });

    // Update submission
    await latestSubmission.update({
      reviewedAt: new Date()
    });

    // Update task
    const updateData = {
      status,
      finalRating: rating
    };

    if (status === 'completed') {
      updateData.completedAt = new Date();
      // Standard points by difficulty (not chosen by the mentor).
      updateData.pointsAwarded = pointsForDifficulty(task.roadmapTask?.difficulty);
    } else if (status === 'revision_needed') {
      updateData.revisionCount = task.revisionCount + 1;
    }

    await task.update(updateData);

    // Update enrollment stats
    await this.updateEnrollmentTaskStats(task.enrollmentId);

    return this.getAssignedTaskById(taskId);
  }

  /**
   * Update task status (start, cancel, etc.)
   */
  async updateTaskStatus(taskId, userId, userRole, status) {
    const task = await models.AssignedTask.findByPk(taskId);

    if (!task) {
      throw new NotFoundError('Task not found');
    }

    // Permissions (derived, not base-role): the mentee may drive their own task;
    // anyone else must be able to manage it (lead/co-mentor of the clan, admin,
    // or the assigning mentor). Keyed off capability, so a mentee-based co-mentor
    // is allowed and a co-mentor with the permission revoked is not.
    const isOwnerMentee = task.menteeId === userId;
    if (!isOwnerMentee && !(await authzService.canActOnTask(userId, task, [PERMISSIONS.TASK_REVIEW, PERMISSIONS.TASK_ASSIGN]))) {
      throw new ForbiddenError('Not authorized');
    }

    const validStatuses = ['not_started', 'assigned', 'in_progress', 'submitted', 'revision_needed', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      throw new ValidationError('Invalid status');
    }

    const updateData = { status };

    if (status === 'in_progress' && !task.startedAt) {
      updateData.startedAt = new Date();
    }

    await task.update(updateData);

    return this.getAssignedTaskById(taskId);
  }

  /**
   * Update enrollment task statistics.
   * tasksTotal is the FULL program roadmap task count (not just assigned tasks)
   * so the percentage reflects true progress through the whole program from day 1.
   * Also auto-advances week/level and marks program_completed when all done.
   */
  async updateEnrollmentTaskStats(enrollmentId) {
    // Load enrollment to know which program we're in
    const enrollment = await models.Enrollment.findByPk(enrollmentId);
    if (!enrollment) return null;

    // Progress is measured against the mentee's ACTUAL workload - every
    // non-cancelled task assigned to this enrollment - and completed is the done
    // subset of that SAME set. This keeps completed ⊆ total, so the bar can never
    // read 100% while real tasks are still outstanding (the old base-roadmap +
    // custom heuristic undercounted tasks assigned from non-base/local roadmaps,
    // which falsely hit 100% and prematurely triggered completion).
    const assignedTasks = await models.AssignedTask.findAll({
      where: { enrollmentId }
    });
    const liveTasks = assignedTasks.filter(t => t.status !== 'cancelled');

    const tasksTotal = liveTasks.length;
    const tasksCompleted = liveTasks.filter(t => t.status === 'completed').length;

    const totalPointsEarned = liveTasks
      .filter(t => t.status === 'completed')
      .reduce((sum, t) => sum + (t.pointsAwarded || 0), 0);

    const ratings = liveTasks
      .filter(t => t.finalRating !== null)
      .map(t => parseFloat(t.finalRating));

    const avgTaskRating = ratings.length > 0
      ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length
      : null;

    // Percentage against the full program - grows steadily as work is done
    const overallProgressPercentage = tasksTotal > 0
      ? Math.round((tasksCompleted / tasksTotal) * 100)
      : 0;

    // Completion is the MENTOR's call. When every program task (roadmap + custom)
    // is done we don't silently complete - we flag the enrollment as ready for
    // sign-off ('pending_completion', marked system-requested) so the mentor is
    // prompted to confirm. If work reopens, only the system-flagged ones revert.
    const allProgramTasksDone = tasksTotal > 0 && tasksCompleted >= tasksTotal;
    const currentEnrollment = await models.Enrollment.findByPk(enrollmentId);
    const current = currentEnrollment?.status;

    let statusUpdate = {};
    if (allProgramTasksDone) {
      if (current === 'active' || current === 'matched') {
        statusUpdate = {
          status: 'pending_completion',
          completionRequestedAt: new Date(),
          completionRequestedBy: null,
          completionRequestedByRole: 'system',
          completionRejectionReason: null
        };
      }
    } else if (current === 'pending_completion' && currentEnrollment?.completionRequestedByRole === 'system') {
      // Auto-flagged as ready, but new work appeared - send it back to active.
      statusUpdate = {
        status: 'active',
        completionRequestedAt: null,
        completionRequestedBy: null,
        completionRequestedByRole: null
      };
    }

    await models.Enrollment.update(
      {
        tasksCompleted,
        tasksTotal,
        totalPointsEarned,
        avgTaskRating,
        overallProgressPercentage,
        ...statusUpdate
      },
      { where: { id: enrollmentId } }
    );

    // Just flagged ready for sign-off → prompt the mentor(s) to confirm completion.
    // Fire-and-forget so task stats never fail on a notification hiccup.
    if (statusUpdate.status === 'pending_completion') {
      this._notifyMentorsReadyForSignoff(enrollment).catch((err) =>
        console.error('[Completion] sign-off prompt failed:', err.message)
      );
    }

    // Auto-advance week / level when the current week's tasks are all done
    if (!allProgramTasksDone) {
      await this._checkAndAdvanceProgress(enrollment, assignedTasks);
    }

    return {
      tasksCompleted,
      tasksTotal,
      totalPointsEarned,
      avgTaskRating,
      overallProgressPercentage
    };
  }

  /**
   * Notify the mentee's mentor(s) that an enrollment has all tasks done and is
   * ready for their completion sign-off. Resolves mentors via active 1:1 match
   * OR the mentee's active clan (lead/co/core mentors) - same union the
   * completion authorization uses. Mentee gets program + program name context.
   */
  async _notifyMentorsReadyForSignoff(enrollment) {
    const program = await models.Program.findByPk(enrollment.programId, { attributes: ['id', 'name'] });
    const programName = program?.name || 'the program';
    const mentee = await models.User.findByPk(enrollment.menteeId, { attributes: ['firstName', 'lastName'] });
    const menteeName = mentee ? `${mentee.firstName} ${mentee.lastName}`.trim() : 'Your mentee';

    const mentorIds = new Set();
    const matches = await models.MentorMenteeMatch.findAll({
      where: { enrollmentId: enrollment.id, status: 'active' },
      attributes: ['mentorId']
    });
    matches.forEach((m) => mentorIds.add(m.mentorId));

    const menteeClans = await models.ClanMembership.findAll({
      where: { userId: enrollment.menteeId, status: 'active', role: 'mentee' },
      include: [{ model: models.Clan, as: 'clan', attributes: ['programId'] }]
    });
    const clanIds = menteeClans
      .filter((m) => !m.clan || m.clan.programId === enrollment.programId)
      .map((m) => m.clanId);
    if (clanIds.length) {
      const mentors = await models.ClanMembership.findAll({
        where: { clanId: { [Op.in]: clanIds }, status: 'active', role: { [Op.in]: ['lead_mentor', 'co_mentor', 'core_team'] } },
        attributes: ['userId']
      });
      mentors.forEach((m) => mentorIds.add(m.userId));
    }

    if (!mentorIds.size) return;

    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.COMPLETION_READY_FOR_SIGNOFF,
      recipients: [...mentorIds].map((userId) => ({ userId })),
      payload: {
        title: 'Ready to complete',
        message: `${menteeName} has finished all tasks in "${programName}". Review and confirm program completion.`,
        actionUrl: `/mentor/mentees/${enrollment.menteeId}`,
        actionLabel: 'Review & confirm',
        relatedEntityType: 'enrollment',
        relatedEntityId: enrollment.id,
        emailSubject: 'Pathment: a mentee is ready to complete their program'
      },
      dedupe: {
        relatedEntityType: 'completion_signoff',
        relatedEntityId: enrollment.id
      }
    });
  }

  /**
   * Deprecated: week-based auto-advance was removed with the week curriculum.
   * Week/level progression is now mentor-driven (the mentor approves level
   * completion via the enrollment flow). Kept as a no-op for callers.
   */
  async _checkAndAdvanceProgress() {
    return;
  }

  /**
   * Get task statistics for mentor dashboard
   */
  async getMentorTaskStats(mentorId) {
    const allTasks = await models.AssignedTask.findAll({
      where: { mentorId }
    });

    const pendingReview = allTasks.filter(t => t.status === 'submitted').length;
    const completed = allTasks.filter(t => t.status === 'completed').length;
    const revisionNeeded = allTasks.filter(t => t.status === 'revision_needed').length;
    const active = allTasks.filter(t => ['assigned', 'in_progress'].includes(t.status)).length;

    // Get tasks reviewed today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const reviewedToday = allTasks.filter(t => 
      t.completedAt && new Date(t.completedAt) >= today
    ).length;

    return {
      total: allTasks.length,
      pendingReview,
      reviewedToday,
      completed,
      revisionNeeded,
      active
    };
  }

  /**
   * Get task statistics for mentee dashboard
   */
  async getMenteeTaskStats(menteeId, enrollmentId) {
    const where = { menteeId };
    if (enrollmentId) {
      where.enrollmentId = enrollmentId;
    }

    const allTasks = await models.AssignedTask.findAll({ where });

    const completed = allTasks.filter(t => t.status === 'completed').length;
    const inProgress = allTasks.filter(t => t.status === 'in_progress').length;
    const pending = allTasks.filter(t => t.status === 'assigned').length;
    const submitted = allTasks.filter(t => t.status === 'submitted').length;
    const revisionNeeded = allTasks.filter(t => t.status === 'revision_needed').length;

    // Count overdue tasks
    const now = new Date();
    const overdue = allTasks.filter(t => 
      t.dueDate && 
      new Date(t.dueDate) < now && 
      !['completed', 'cancelled'].includes(t.status)
    ).length;

    return {
      total: allTasks.filter(t => t.status !== 'cancelled').length, // cancelled don't count
      completed,
      inProgress,
      pending,
      submitted,
      revisionNeeded,
      overdue
    };
  }

  /**
   * Delete custom task (mentor only)
   */
  async deleteCustomTask(taskId, mentorId) {
    const task = await models.AssignedTask.findByPk(taskId, {
      include: [{ model: models.RoadmapTask, as: 'roadmapTask' }]
    });

    if (!task) {
      throw new NotFoundError('Task not found');
    }

    if (!task.isCustomTask) {
      throw new ValidationError('Only custom tasks can be deleted');
    }

    if (!(await authzService.canActOnTask(mentorId, task, PERMISSIONS.TASK_ASSIGN))) {
      throw new ForbiddenError('You do not have permission to delete this task');
    }

    if (task.status === 'completed' || task.status === 'submitted') {
      throw new ValidationError('Cannot delete submitted or completed tasks');
    }

    const enrollmentId = task.enrollmentId;
    const roadmapTaskId = task.roadmapTaskId;

    // Delete assigned task
    await task.destroy();

    // Delete the custom roadmap task if no other assignments exist
    const otherAssignments = await models.AssignedTask.count({
      where: { roadmapTaskId }
    });

    if (otherAssignments === 0) {
      await models.RoadmapTask.destroy({ where: { id: roadmapTaskId } });
    }

    // Update enrollment stats
    await this.updateEnrollmentTaskStats(enrollmentId);

    return { message: 'Custom task deleted successfully' };
  }

  /**
   * Cancel a task (admin/mentor only)
   * Marks task as cancelled and records who cancelled it
   */
  /** Normalize a due-date input (ISO instant or YYYY-MM-DD → end-of-day in the
   *  mentee's timezone) into a real UTC instant. */
  async _resolveDueDate(menteeId, dueDate) {
    const dateOnly = String(dueDate).split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
      const s = await models.UserSettings.findOne({ where: { userId: menteeId }, attributes: ['timezone'] });
      return endOfDayInZone(dateOnly, s?.timezone || 'UTC');
    }
    return new Date(dueDate);
  }

  /**
   * Mentor edits ONE mentee's assigned task: per-mentee overrides over the shared
   * roadmap step (title/description/deliverable/acceptance criteria/resources) +
   * a mentor note + due date. Passing null/'' for an override clears it (back to
   * the roadmap default). Authorization is enforced at the route (task.assign
   * scoped to the task's clan), so co-mentors/leads can edit too.
   */
  async updateAssignedTask(taskId, userId, userRole, data = {}) {
    const task = await models.AssignedTask.findByPk(taskId);
    if (!task) throw new NotFoundError('Task not found');
    if (task.status === 'completed') throw new ValidationError('Cannot edit a completed task');

    const overrideFields = ['titleOverride', 'descriptionOverride', 'deliverableOverride', 'acceptanceCriteriaOverride', 'resourcesOverride', 'mentorNote'];
    for (const f of overrideFields) {
      if (f in data) {
        const v = data[f];
        task[f] = (v === '' || v == null || (Array.isArray(v) && !v.length)) ? null : v;
      }
    }
    // Points are standardized by difficulty and not editable per assignment, so
    // any incoming pointsBase is intentionally ignored here.
    if ('dueDate' in data && data.dueDate) {
      task.dueDate = await this._resolveDueDate(task.menteeId, data.dueDate);
    }
    await task.save();
    return this.getAssignedTaskById(taskId);
  }

  /**
   * Reassign (reactivate) a cancelled task in place: clears the cancellation and
   * resets the lifecycle so the mentee gets it fresh. Combined with editing, the
   * mentor fixes whatever was wrong and re-assigns the same task.
   */
  async reactivateTask(taskId, userId, userRole, { dueDate } = {}) {
    const task = await models.AssignedTask.findByPk(taskId);
    if (!task) throw new NotFoundError('Task not found');
    if (task.status !== 'cancelled') throw new ValidationError('Only a cancelled task can be reassigned');

    task.status = 'assigned';
    task.cancelledBy = null;
    task.cancelledAt = null;
    task.cancellationReason = null;
    task.assignedAt = new Date();
    task.startedAt = null;
    task.submittedAt = null;
    task.completedAt = null;
    if (dueDate) task.dueDate = await this._resolveDueDate(task.menteeId, dueDate);
    await task.save();
    await this.updateEnrollmentTaskStats(task.enrollmentId);
    return this.getAssignedTaskById(taskId);
  }

  async cancelTask(taskId, userId, userRole, reason = null) {
    const task = await models.AssignedTask.findByPk(taskId, {
      include: [
        { model: models.RoadmapTask, as: 'roadmapTask' },
        { 
          model: models.Enrollment, 
          as: 'enrollment',
          include: [
            { model: models.User, as: 'mentee' }
          ]
        }
      ]
    });

    if (!task) {
      throw new NotFoundError('Task not found');
    }

    // Authorization (derived): admins, the assigning mentor, or a lead/co-mentor
    // of the mentee's clan who can review/assign there.
    if (!(await authzService.canActOnTask(userId, task, [PERMISSIONS.TASK_REVIEW, PERMISSIONS.TASK_ASSIGN]))) {
      throw new ForbiddenError('You do not have permission to cancel this task');
    }

    // Cannot cancel already completed tasks
    if (task.status === 'completed') {
      throw new ValidationError('Cannot cancel completed tasks');
    }

    // Update task status to cancelled
    task.status = 'cancelled';
    task.cancelledBy = userId;
    task.cancelledAt = new Date();
    task.cancellationReason = reason;
    await task.save();

    // Update enrollment stats
    await this.updateEnrollmentTaskStats(task.enrollmentId);

    return task;
  }

  /**
   * Mentor/admin sets a new deadline on an assigned task (e.g. "I want this in
   * 2 days"). Anchors a date-only value to END OF DAY in the mentee's timezone,
   * matching the extension flow, and re-evaluates lateness. Notifies the mentee.
   */
  async updateTaskDueDate(taskId, userId, userRole, dueDate) {
    const task = await models.AssignedTask.findByPk(taskId, {
      include: [{ model: models.RoadmapTask, as: 'roadmapTask', attributes: ['title'] }]
    });
    if (!task) throw new NotFoundError('Task not found');

    if (!(await authzService.canActOnTask(userId, task, PERMISSIONS.TASK_ASSIGN))) {
      throw new ForbiddenError('You do not have permission to change this task\'s deadline');
    }
    if (task.status === 'completed') throw new ValidationError('Cannot change the deadline of a completed task');
    if (!dueDate) throw new ValidationError('A due date is required');

    // Accept either a full ISO instant or a date-only string. Date-only is
    // anchored to the end of that day in the mentee's timezone (true UTC instant).
    let finalDueDate;
    const dateOnly = String(dueDate).split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
      const menteeSettings = await models.UserSettings.findOne({
        where: { userId: task.menteeId }, attributes: ['timezone']
      });
      const menteeTz = menteeSettings?.timezone || 'UTC';
      finalDueDate = endOfDayInZone(dateOnly, menteeTz) || new Date(dueDate);
    } else {
      finalDueDate = new Date(dueDate);
    }
    if (Number.isNaN(new Date(finalDueDate).getTime())) throw new ValidationError('A valid due date is required');

    task.dueDate = finalDueDate;
    if (task.submittedAt) task.isLate = new Date(task.submittedAt) > new Date(finalDueDate);
    await task.save();

    const title = task.roadmapTask?.title || 'your task';
    const dueStr = new Date(finalDueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.TASK_ASSIGNED,
      recipients: [{ userId: task.menteeId }],
      payload: {
        title: 'Task deadline updated',
        message: `The deadline for “${title}” is now ${dueStr}.`,
        actionUrl: `/mentee/tasks/${task.id}`,
        actionLabel: 'Open task',
        relatedEntityType: 'assigned_task',
        relatedEntityId: task.id,
      },
    }).catch((e) => console.error('[Task] due-date notification failed:', e.message));

    return task;
  }

  /**
   * Unassign (delete) an assigned task — for a mistaken assignment. Works for
   * BOTH roadmap-step and custom tasks (unlike deleteCustomTask). Refuses once
   * the mentee has submitted/completed work, so nothing real is lost. If it was
   * a one-off custom task with no other assignees, its RoadmapTask is cleaned up.
   */
  async unassignTask(taskId, userId, userRole) {
    const task = await models.AssignedTask.findByPk(taskId);
    if (!task) throw new NotFoundError('Task not found');

    if (!(await authzService.canActOnTask(userId, task, PERMISSIONS.TASK_ASSIGN))) {
      throw new ForbiddenError('You do not have permission to unassign this task');
    }
    if (['submitted', 'completed'].includes(task.status)) {
      throw new ValidationError('This task has been submitted or completed — cancel it instead of unassigning');
    }

    const { enrollmentId, roadmapTaskId, isCustomTask } = task;
    await task.destroy();

    // Custom one-off tasks own their RoadmapTask row; remove it when orphaned.
    if (isCustomTask && roadmapTaskId) {
      const others = await models.AssignedTask.count({ where: { roadmapTaskId } });
      if (others === 0) await models.RoadmapTask.destroy({ where: { id: roadmapTaskId } });
    }
    if (enrollmentId) await this.updateEnrollmentTaskStats(enrollmentId);

    return { message: 'Task unassigned' };
  }

  /**
   * Get roadmap tasks for a program (for mentors to view and assign).
   * If menteeId is provided, include assignment status for that mentee.
   */
  async getRoadmapTasks(programId, menteeId = null) {
    // Get the base roadmap for this program.
    const roadmap = await models.Roadmap.findOne({
      where: { programId, isBaseRoadmap: true }
    });

    if (!roadmap) {
      throw new NotFoundError('Roadmap not found for this program');
    }

    // Tasks link to the roadmap directly via roadmap_id (weeks were removed).
    const tasks = await models.RoadmapTask.findAll({
      where: { roadmapId: roadmap.id, isCustomTask: false },
      order: [['taskOrder', 'ASC']]
    });

    // Annotate each task with this mentee's assignment status, if asked.
    if (menteeId) {
      for (const task of tasks) {
        const assignedTask = await models.AssignedTask.findOne({
          where: { menteeId, roadmapTaskId: task.id },
          attributes: ['id', 'status', 'submittedAt', 'completedAt']
        });
        task.dataValues.assignmentStatus = assignedTask ? {
          isAssigned: true,
          taskId: assignedTask.id,
          status: assignedTask.status,
          submittedAt: assignedTask.submittedAt,
          completedAt: assignedTask.completedAt
        } : { isAssigned: false };
      }
    }

    // Preserve the consumer shape (roadmap.weeks[].tasks[]) with a single group.
    const result = roadmap.toJSON();
    result.weeks = [{ id: roadmap.id, weekNumber: 1, title: 'Roadmap', tasks: tasks.map((t) => t.toJSON ? t.toJSON() : t) }];
    return result;
  }
}

module.exports = new TaskService();
