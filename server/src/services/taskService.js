const { models } = require('../db');
const { NotFoundError, ForbiddenError, ValidationError } = require('../utils/errors/errorTypes');
const { Op } = require('sequelize');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');

class TaskService {
  /**
   * Auto-assign roadmap tasks for a mentee's current week
   * Called when mentee advances to a new week
   */
  async autoAssignWeekTasks(enrollmentId, weekNumber) {
    const enrollment = await models.Enrollment.findByPk(enrollmentId, {
      include: [
        { model: models.Program, as: 'program' },
        { model: models.ProgramLevel, as: 'currentLevel' },
        { model: models.User, as: 'mentee' }
      ]
    });

    if (!enrollment) {
      throw new NotFoundError('Enrollment not found');
    }

    // Get the mentee's mentor
    const match = await models.MentorMenteeMatch.findOne({
      where: {
        enrollmentId,
        status: 'active'
      }
    });

    if (!match) {
      throw new ValidationError('No active mentor assigned');
    }

    // Get roadmap for this level
    const roadmap = await models.Roadmap.findOne({
      where: {
        programId: enrollment.programId,
        levelId: enrollment.currentLevelId,
        isBaseRoadmap: true
      }
    });

    if (!roadmap) {
      throw new NotFoundError('Roadmap not found for this level');
    }

    // Get the week from roadmap
    const week = await models.RoadmapWeek.findOne({
      where: {
        roadmapId: roadmap.id,
        weekNumber
      },
      include: [
        {
          model: models.RoadmapTask,
          as: 'tasks',
          order: [['taskOrder', 'ASC']]
        }
      ]
    });

    if (!week) {
      return { assignedTasks: [] }; // No tasks for this week
    }

    const assignedTasks = [];
    
    for (const task of week.tasks) {
      // Check if task is already assigned
      const existing = await models.AssignedTask.findOne({
        where: {
          roadmapTaskId: task.id,
          menteeId: enrollment.menteeId,
          enrollmentId
        }
      });

      if (!existing) {
        // Calculate due date (1 week from now for weekly tasks)
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 7);

        const assignedTask = await models.AssignedTask.create({
          roadmapTaskId: task.id,
          menteeId: enrollment.menteeId,
          mentorId: match.mentorId,
          enrollmentId,
          status: 'assigned',
          dueDate,
          isCustomTask: false
        });

        const fullTask = await this.getAssignedTaskById(assignedTask.id);
        assignedTasks.push(fullTask);

        await notificationOrchestrator.dispatch({
          eventKey: NOTIFICATION_EVENTS.TASK_ASSIGNED,
          recipients: [{ userId: fullTask.menteeId }],
          payload: {
            title: 'New task assigned',
            message: `A new task "${fullTask.roadmapTask?.title || 'Task'}" has been assigned to you.`,
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
      }
    }

    // Update enrollment task stats
    await this.updateEnrollmentTaskStats(enrollmentId);

    return { assignedTasks, week: week.title };
  }

  /**
   * Create custom task (mentor creates for specific mentee)
   */
  async createCustomTask(data, mentorId) {
    const {
      menteeId,
      enrollmentId,
      roadmapTaskId, // NEW: If provided, assign existing roadmap task
      title,
      description,
      type,
      difficulty,
      dueDate,
      pointsBase,
      deliverable,
      acceptanceCriteria
    } = data;

    // Verify mentor-mentee relationship
    const match = await models.MentorMenteeMatch.findOne({
      where: {
        mentorId,
        menteeId,
        enrollmentId,
        status: 'active'
      }
    });

    if (!match) {
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
      // Create custom roadmap task
      roadmapTask = await models.RoadmapTask.create({
        roadmapWeekId: null, // Custom tasks don't belong to a week
        title,
        description,
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
      isCustomTask: roadmapTaskId ? false : true // Roadmap tasks are not custom
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
          as: 'roadmapTask',
          include: [
            {
              model: models.RoadmapWeek,
              as: 'week'
            }
          ]
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
            { model: models.Program, as: 'program' },
            { model: models.ProgramLevel, as: 'currentLevel' }
          ]
        },
        {
          model: models.TaskSubmission,
          as: 'submissions',
          separate: true,
          order: [['version', 'DESC']],
          limit: 1
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
          as: 'roadmapTask',
          include: [
            {
              model: models.RoadmapWeek,
              as: 'week'
            }
          ]
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
            { model: models.Program, as: 'program' },
            { model: models.ProgramLevel, as: 'currentLevel' }
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
              model: models.RoadmapWeek,
              as: 'week'
            },
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
            { model: models.Program, as: 'program' },
            { model: models.ProgramLevel, as: 'currentLevel' }
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
    await task.update({
      status: 'submitted',
      submittedAt: new Date(),
      currentSubmissionVersion: version,
      startedAt: task.startedAt || new Date(),
      isLate: task.dueDate && new Date() > new Date(task.dueDate)
    });

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
    // (the Roadmap.total_tasks column is never updated when tasks are added, so we count directly)
    // PLUS any non-cancelled custom tasks assigned to this specific enrollment.
    const roadmapTasksTotal = await models.RoadmapTask.count({
      include: [{
        model: models.RoadmapWeek,
        as: 'week',
        required: true,
        include: [{
          model: models.Roadmap,
          as: 'roadmap',
          required: true,
          where: { programId: enrollment.programId, isBaseRoadmap: true }
        }]
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

    // If every task in the program (roadmap + custom) is completed, mark the enrollment done
    const allProgramTasksDone = tasksTotal > 0 && tasksCompleted >= tasksTotal;

    // If there are now uncompleted tasks and the enrollment was previously auto-marked
    // as program_completed (e.g. a custom task was just assigned), revert to active.
    const currentEnrollment = await models.Enrollment.findByPk(enrollmentId);
    const revertStatus =
      !allProgramTasksDone && currentEnrollment?.status === 'program_completed'
        ? { status: 'active', completedAt: null }
        : {};

    const statusUpdate = allProgramTasksDone
      ? { status: 'program_completed', completedAt: new Date() }
      : revertStatus;

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
   * After every task review, check whether the mentee has finished the current
   * week and should move on to the next week or level.
   */
  async _checkAndAdvanceProgress(enrollment, assignedTasks) {
    const currentWeek = enrollment.currentWeek || 1;

    // Load the base roadmap for the current level including all weeks/tasks
    const currentRoadmap = await models.Roadmap.findOne({
      where: {
        programId: enrollment.programId,
        levelId: enrollment.currentLevelId,
        isBaseRoadmap: true
      },
      include: [{
        model: models.RoadmapWeek,
        as: 'weeks',
        order: [['weekNumber', 'ASC']],
        include: [{ model: models.RoadmapTask, as: 'tasks', attributes: ['id'] }]
      }]
    });

    if (!currentRoadmap || !currentRoadmap.weeks || currentRoadmap.weeks.length === 0) return;

    const currentRoadmapWeek = currentRoadmap.weeks.find(w => w.weekNumber === currentWeek);
    if (!currentRoadmapWeek || !currentRoadmapWeek.tasks || currentRoadmapWeek.tasks.length === 0) return;

    const currentWeekTaskIds = new Set(currentRoadmapWeek.tasks.map(t => t.id));

    // Only consider non-cancelled assigned tasks that belong to the current week
    const currentWeekAssigned = assignedTasks.filter(t =>
      currentWeekTaskIds.has(t.roadmapTaskId) && t.status !== 'cancelled'
    );

    // All current-week tasks must be completed before advancing
    if (currentWeekAssigned.length === 0) return;
    const allCurrentWeekDone = currentWeekAssigned.every(t => t.status === 'completed');
    if (!allCurrentWeekDone) return;

    // Is there a next week in the same level?
    const nextRoadmapWeek = currentRoadmap.weeks.find(w => w.weekNumber === currentWeek + 1);
    if (nextRoadmapWeek) {
      // Advance week within the same level
      await models.Enrollment.update(
        { currentWeek: currentWeek + 1, status: 'active' },
        { where: { id: enrollment.id } }
      );
      await this.autoAssignWeekTasks(enrollment.id, currentWeek + 1);
      return;
    }

    // No next week — check for a next level
    const program = await models.Program.findByPk(enrollment.programId, {
      include: [{ model: models.ProgramLevel, as: 'levels', separate: true, order: [['levelOrder', 'ASC']] }]
    });

    const levels = program?.levels || [];
    const currentLevelIdx = levels.findIndex(l => l.id === enrollment.currentLevelId);
    const nextLevel = levels[currentLevelIdx + 1];

    if (nextLevel) {
      // Advance the enrollment record to the next level
      await models.Enrollment.update(
        { currentLevelId: nextLevel.id, currentWeek: 1, status: 'active' },
        { where: { id: enrollment.id } }
      );

      // ── Smart re-match ───────────────────────────────────────────────────
      // Find the most-recently-created active match for this enrollment.
      const currentMatch = await models.MentorMenteeMatch.findOne({
        where: { enrollmentId: enrollment.id, status: 'active' },
        order: [['matchedAt', 'DESC']]
      });

      if (currentMatch) {
        // Is that mentor assigned to teach the next level?
        const mentorCanTeachNextLevel = await models.LevelMentorAssignment.findOne({
          where: {
            mentorId: currentMatch.mentorId,
            levelId: nextLevel.id,
            isActive: true
          }
        });

        if (mentorCanTeachNextLevel) {
          // Same mentor continues — create a match for the next level and begin week 1
          await models.MentorMenteeMatch.create({
            mentorId: currentMatch.mentorId,
            menteeId: enrollment.menteeId,
            enrollmentId: enrollment.id,
            levelId: nextLevel.id,
            matchedBy: currentMatch.matchedBy,
            status: 'active',
            matchedAt: new Date()
          });
          await this.autoAssignWeekTasks(enrollment.id, 1);
        } else {
          // Mentor is not qualified for the next level — re-queue for admin assignment.
          // Week 1 tasks will be assigned once admin creates the new match.
          await models.Enrollment.update(
            { status: 'pending_match' },
            { where: { id: enrollment.id } }
          );
        }
      } else {
        // No active match found (edge case) — re-queue for admin assignment
        await models.Enrollment.update(
          { status: 'pending_match' },
          { where: { id: enrollment.id } }
        );
      }
    }
    // If no next level, all work in the program is done — program_completed
    // is already handled by the caller (allProgramTasksDone check above)
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
   * Get roadmap tasks for a program level (for mentors to view and assign)
   * If menteeId is provided, include assignment status for that mentee
   */
  async getRoadmapTasks(programId, levelId, menteeId = null) {
    // Get the roadmap for this program/level
    const roadmap = await models.Roadmap.findOne({
      where: {
        programId,
        levelId,
        isBaseRoadmap: true
      },
      include: [
        {
          model: models.RoadmapWeek,
          as: 'weeks',
          include: [
            {
              model: models.RoadmapTask,
              as: 'tasks',
              where: { isCustomTask: false },
              required: false
            }
          ]
        }
      ],
      order: [[{ model: models.RoadmapWeek, as: 'weeks' }, 'weekNumber', 'ASC']]
    });

    if (!roadmap) {
      throw new NotFoundError('Roadmap not found for this program level');
    }

    // If menteeId is provided, check which tasks are already assigned to this mentee
    if (menteeId && roadmap.weeks) {
      for (const week of roadmap.weeks) {
        if (week.tasks) {
          for (const task of week.tasks) {
            // Check if this roadmap task is assigned to the mentee
            const assignedTask = await models.AssignedTask.findOne({
              where: {
                menteeId,
                roadmapTaskId: task.id
              },
              attributes: ['id', 'status', 'submittedAt', 'completedAt']
            });

            // Add assignment status to the task object
            task.dataValues.assignmentStatus = assignedTask ? {
              isAssigned: true,
              taskId: assignedTask.id,
              status: assignedTask.status,
              submittedAt: assignedTask.submittedAt,
              completedAt: assignedTask.completedAt
            } : {
              isAssigned: false
            };
          }
        }
      }
    }

    return roadmap;
  }
}

module.exports = new TaskService();
