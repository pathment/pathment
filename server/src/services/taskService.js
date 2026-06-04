const { models } = require('../db');
const { NotFoundError, ForbiddenError, ValidationError } = require('../utils/errors/errorTypes');
const { Op } = require('sequelize');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');

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
      acceptanceCriteria
    } = data;
    let { enrollmentId } = data;

    // Resolve the active enrollment if the caller didn't supply one (the assign
    // drawer only knows the mentee). Falls back to most-recent enrollment.
    if (!enrollmentId) {
      const enrollment = await this._activeEnrollmentForMentee(menteeId);
      if (!enrollment) throw new NotFoundError('Mentee has no enrollment to attach this task to');
      enrollmentId = enrollment.id;
    }

    // Verify the mentor is responsible for this mentee — via a legacy 1:1 match
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
      // Create custom roadmap task (not part of any roadmap — a one-off).
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
        pointsBase: pointsBase || 10
      });
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

    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.TASK_ASSIGNED,
      recipients: [{ userId: fullTask.menteeId }],
      payload: {
        title: 'New task assigned',
        message: `Mentor assigned "${fullTask.roadmapTask?.title || 'Task'}" to you.`,
        actionUrl: `/mentee/tasks/${fullTask.id}`,
        actionLabel: 'Open Task',
        relatedEntityType: 'assigned_task',
        relatedEntityId: fullTask.id,
        emailSubject: 'Pathment: New task assigned'
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

    return models.AssignedTask.findAll({
      where,
      include: [
        {
          model: models.RoadmapTask,
          as: 'roadmapTask'
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
          limit: 1
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

    return models.AssignedTask.findAll({
      where,
      include: [
        {
          model: models.RoadmapTask,
          as: 'roadmapTask'
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
            }
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

    return task;
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

    if (task.mentorId !== mentorId) {
      throw new ForbiddenError('You are not the mentor for this task');
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
      updateData.pointsAwarded = pointsAwarded || task.roadmapTask?.pointsBase || 10;
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

    // Check permissions
    if (userRole !== 'admin') {
      if (userRole === 'mentee' && task.menteeId !== userId) {
        throw new ForbiddenError('Not authorized');
      }
      if (userRole === 'mentor' && task.mentorId !== userId) {
        throw new ForbiddenError('Not authorized');
      }
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

    // Assigned tasks for stats (completed count, points, ratings)
    const assignedTasks = await models.AssignedTask.findAll({
      where: { enrollmentId }
    });

    const tasksCompleted = assignedTasks.filter(t => t.status === 'completed').length;

    const totalPointsEarned = assignedTasks
      .filter(t => t.status === 'completed')
      .reduce((sum, t) => sum + (t.pointsAwarded || 0), 0);

    const ratings = assignedTasks
      .filter(t => t.finalRating !== null)
      .map(t => parseFloat(t.finalRating));

    const avgTaskRating = ratings.length > 0
      ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length
      : null;

    // Total tasks = live COUNT of RoadmapTask rows for every base roadmap in the program
    // (the Roadmap.total_tasks column is never updated when tasks are added, so we count directly).
    // Tasks link to their roadmap directly via roadmap_id (weeks were removed).
    // PLUS any non-cancelled custom tasks assigned to this specific enrollment.
    const roadmapTasksTotal = await models.RoadmapTask.count({
      include: [{
        model: models.Roadmap,
        as: 'roadmap',
        required: true,
        where: { programId: enrollment.programId, isBaseRoadmap: true }
      }]
    });

    // Count non-cancelled custom tasks assigned to this enrollment so that
    // assigning a custom task immediately reduces the progress percentage.
    const customTasksTotal = await models.AssignedTask.count({
      where: {
        enrollmentId,
        isCustomTask: true,
        status: { [Op.notIn]: ['cancelled'] }
      }
    });

    const tasksTotal = roadmapTasksTotal + customTasksTotal;

    // Percentage against the full program — grows steadily as work is done
    const overallProgressPercentage = tasksTotal > 0
      ? Math.round((tasksCompleted / tasksTotal) * 100)
      : 0;

    // Completion is the MENTOR's call. When every program task (roadmap + custom)
    // is done we don't silently complete — we flag the enrollment as ready for
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
      // Auto-flagged as ready, but new work appeared — send it back to active.
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
   * OR the mentee's active clan (lead/co/core mentors) — same union the
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
      total: allTasks.length,
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

    if (task.mentorId !== mentorId) {
      throw new ForbiddenError('You can only delete your own custom tasks');
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

    // Authorization: Admin can cancel any task, mentor can only cancel their own mentee's tasks
    if (userRole === 'mentor') {
      if (task.mentorId !== userId) {
        throw new ForbiddenError('You can only cancel tasks for your own mentees');
      }
    } else if (userRole !== 'admin') {
      throw new ForbiddenError('Only admins and mentors can cancel tasks');
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
