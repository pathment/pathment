const { Op } = require('sequelize');
const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/cloudinaryUpload');
const { models } = require('../db');
const { NotFoundError, ForbiddenError, ValidationError } = require('../utils/errors/errorTypes');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const { endOfDayInZone } = require('../utils/timezone');
const authzService = require('./authzService');
const { PERMISSIONS } = require('../config/permissions');

class SubmissionService {
  /**
   * Submit task with files and rich text content
   */
  async submitTaskWithFiles(taskId, menteeId, submissionData, files = []) {
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

    // Upload files to Cloudinary
    // PDFs and documents must use 'raw' so Cloudinary delivers them via
    // /raw/upload/ - using 'auto' maps PDFs to the image pipeline
    // (/image/upload/) which requires signing and returns 401.
    const getCloudinaryResourceType = (mimetype) => {
      if (mimetype.startsWith('video/')) return 'video';
      if (mimetype.startsWith('image/')) return 'image';
      return 'raw'; // application/pdf and all other document types
    };

    const uploadedFiles = [];
    for (const file of files) {
      try {
        const resourceType = getCloudinaryResourceType(file.mimetype);
        const result = await uploadToCloudinary(
          file.buffer,
          `pathment/submissions/${taskId}`,
          resourceType
        );
        console.log('[Cloudinary] upload result:', {
          public_id: result.public_id,
          secure_url: result.secure_url,
          resource_type: result.resource_type,
          type: result.type,
          access_mode: result.access_mode
        });

        uploadedFiles.push({
          fileName: file.originalname,
          fileUrl: result.secure_url,
          fileType: file.mimetype,
          fileSizeBytes: file.size,
          cloudinaryPublicId: result.public_id
        });
      } catch (error) {
        console.error('Error uploading file:', error);
        throw new ValidationError(`Failed to upload file: ${file.originalname}`);
      }
    }

    // Get the current maximum version for this task
    const existingSubmissions = await models.TaskSubmission.findAll({
      where: { assignedTaskId: taskId },
      attributes: ['version'],
      order: [['version', 'DESC']],
      limit: 1
    });

    const currentMaxVersion = existingSubmissions.length > 0 ? existingSubmissions[0].version : 0;
    const newVersion = currentMaxVersion + 1;

    // Create submission
    const submission = await models.TaskSubmission.create({
      assignedTaskId: taskId,
      version: newVersion,
      submissionText: submissionData.submissionText || '',
      submissionUrls: submissionData.submissionUrls || [],
      status: 'pending',
      extensionRequested: submissionData.extensionRequested || false,
      extensionReason: submissionData.extensionReason || null,
      extensionDays: submissionData.extensionDays || null,
      extensionStatus: submissionData.extensionRequested ? 'pending' : null
    });

    // Save file attachments
    for (const fileData of uploadedFiles) {
      await models.TaskSubmissionFile.create({
        submissionId: submission.id,
        ...fileData
      });
    }

    // Update task status (persist time-spent the mentee reported, if any)
    const reportedHours = Number(submissionData.timeSpentHours);
    await task.update({
      status: 'submitted',
      submittedAt: new Date(),
      currentSubmissionVersion: newVersion,
      startedAt: task.startedAt || new Date(),
      isLate: task.dueDate && new Date() > new Date(task.dueDate),
      ...(Number.isFinite(reportedHours) && reportedHours > 0 ? { timeSpentHours: reportedHours } : {})
    });

    // Return complete submission with files
    const fullSubmission = await this.getSubmissionById(submission.id);

    const submitter = await models.User.findByPk(task.menteeId, { attributes: ['firstName', 'lastName'] });
    const submitterName = submitter ? `${submitter.firstName} ${submitter.lastName}`.trim() : 'A mentee';
    const submittedTitle = fullSubmission.assignedTask?.roadmapTask?.title || 'a task';
    const isResubmission = newVersion > 1;

    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.TASK_SUBMITTED,
      recipients: [{ userId: task.mentorId }],
      payload: {
        title: `${submitterName} submitted work to review`,
        message: `${submitterName} ${isResubmission ? 'resubmitted' : 'submitted'} “${submittedTitle}”${isResubmission ? ` (v${newVersion})` : ''}. Review it when you can.`,
        actionUrl: `/mentor/tasks/${task.id}/feedback`,
        actionLabel: 'Review submission',
        relatedEntityType: 'task_submission',
        relatedEntityId: submission.id,
        emailSubject: `${submitterName} submitted “${submittedTitle}” for review`
      },
      dedupe: {
        relatedEntityType: 'task_submitted',
        relatedEntityId: submission.id
      }
    });

    return fullSubmission;
  }

  /**
   * Request extension for a task
   */
  async requestExtension(taskId, menteeId, extensionData) {
    const task = await models.AssignedTask.findByPk(taskId);

    if (!task) {
      throw new NotFoundError('Task not found');
    }

    if (task.menteeId !== menteeId) {
      throw new ForbiddenError('This task is not assigned to you');
    }

    if (task.status === 'completed') {
      throw new ValidationError('Cannot request extension for completed task');
    }

    // Check if there's already a pending extension request
    const latestSubmission = await models.TaskSubmission.findOne({
      where: {
        assignedTaskId: taskId
      },
      order: [['version', 'DESC']]
    });

    if (latestSubmission && latestSubmission.extensionStatus === 'pending') {
      throw new ValidationError('Extension request already pending');
    }

    // Create a submission with extension request
    const version = task.currentSubmissionVersion + 1;
    const submission = await models.TaskSubmission.create({
      assignedTaskId: taskId,
      version,
      submissionText: extensionData.reason || 'Extension request',
      status: 'pending',
      extensionRequested: true,
      extensionReason: extensionData.reason,
      extensionDays: extensionData.days,
      extensionStatus: 'pending'
    });

    const fullSubmission = await this.getSubmissionById(submission.id);

    //  ADD: Send notification to mentor
    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.EXTENSION_REQUESTED,
      recipients: [{ userId: task.mentorId }],
      payload: {
        title: 'Extension request received',
        message: `${fullSubmission.assignedTask?.mentee?.firstName || 'Mentee'} requested an extension for "${fullSubmission.assignedTask?.roadmapTask?.title || 'a task'}" for ${extensionData.days || 'additional'} days.`,
        actionUrl: `/mentor/tasks/${task.id}`,
        actionLabel: 'Review Request',
        relatedEntityType: 'task_submission',
        relatedEntityId: submission.id,
        emailSubject: 'Pathment: Extension request from mentee'
      },
      dedupe: {
        relatedEntityType: 'extension_requested',
        relatedEntityId: submission.id
      }
    });

    return fullSubmission;
  }
  /**
   * Approve or reject extension request
   */
  async handleExtensionRequest(submissionId, mentorId, approved, newDueDate = null) {
    const submission = await models.TaskSubmission.findByPk(submissionId, {
      include: [{
        model: models.AssignedTask,
        as: 'assignedTask'
      }]
    });

    if (!submission) {
      throw new NotFoundError('Submission not found');
    }

    if (!(await authzService.canActOnTask(mentorId, submission.assignedTask, PERMISSIONS.TASK_REVIEW))) {
      throw new ForbiddenError('You do not have permission to act on this task');
    }

    if (!submission.extensionRequested) {
      throw new ValidationError('This is not an extension request');
    }

    if (submission.extensionStatus !== 'pending') {
      throw new ValidationError('Extension request already processed');
    }

    // Resolve the request AND drop it out of the pending approvals queue: an
    // extension request is a 'pending' TaskSubmission, so once handled we mark it
    // 'superseded' (it carries no work to review). Any earlier real work
    // submission for the task that's still pending then re-surfaces for review.
    await submission.update({
      status: 'superseded',
      extensionStatus: approved ? 'approved' : 'rejected',
      reviewedAt: new Date()
    });

    let finalDueDate = newDueDate;
    if (approved) {
      // Target calendar date: the mentor-chosen date, or +3 days from current due.
      let targetDate = newDueDate;
      if (!targetDate) {
        const currentDueDate = new Date(submission.assignedTask.dueDate);
        currentDueDate.setDate(currentDueDate.getDate() + 3);
        targetDate = currentDueDate.toISOString().split('T')[0];
      }
      // Anchor the deadline to END OF DAY in the MENTEE's timezone, so "due
      // June 10" is their whole June 10 - not UTC midnight (the prior evening
      // in the Americas). Stored as a true UTC instant.
      const menteeSettings = await models.UserSettings.findOne({
        where: { userId: submission.assignedTask.menteeId }, attributes: ['timezone']
      });
      const menteeTz = menteeSettings?.timezone || 'UTC';
      const dueInstant = endOfDayInZone(String(targetDate).split('T')[0], menteeTz);
      finalDueDate = dueInstant || targetDate;

      // Recompute lateness against the NEW deadline. The mentee may have already
      // submitted (and been flagged late) before requesting the extension — once
      // we push the due date past that submission, it's no longer late, so clear
      // the stale flag. If they haven't submitted yet, leave it (submit recomputes).
      const at = submission.assignedTask;
      const updateFields = { dueDate: finalDueDate };
      if (at.submittedAt) {
        updateFields.isLate = new Date(at.submittedAt) > new Date(finalDueDate);
      }
      await at.update(updateFields);
    }

    //  ADD: Send notification to mentee
    const updatedSubmission = await this.getSubmissionById(submissionId);
    
    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.EXTENSION_HANDLED,
      recipients: [{ userId: submission.assignedTask.menteeId }],
      payload: {
        title: approved ? 'Extension approved' : 'Extension request rejected',
        message: approved
          ? `Your extension request for "${updatedSubmission.assignedTask?.roadmapTask?.title || 'task'}" was approved. New due date: ${finalDueDate instanceof Date ? finalDueDate.toISOString().split('T')[0] : finalDueDate}`
          : `Your extension request for "${updatedSubmission.assignedTask?.roadmapTask?.title || 'task'}" was rejected.`,
        actionUrl: `/mentee/tasks/${submission.assignedTask.id}`,
        actionLabel: 'View Task',
        relatedEntityType: 'task_submission',
        relatedEntityId: submission.id,
        emailSubject: `Pathment: Extension ${approved ? 'approved' : 'rejected'}`
      },
      dedupe: {
        relatedEntityType: 'extension_handled',
        relatedEntityId: submission.id
      }
    });

    return updatedSubmission;
  }

  /**
   * Review task submission with detailed feedback
   */
  async reviewSubmission(submissionId, mentorId, reviewData) {
    const submission = await models.TaskSubmission.findByPk(submissionId, {
      include: [{
        model: models.AssignedTask,
        as: 'assignedTask',
        include: [{
          model: models.RoadmapTask,
          as: 'roadmapTask'
        }]
      }]
    });

    if (!submission) {
      throw new NotFoundError('Submission not found');
    }

    const task = submission.assignedTask;

    if (!(await authzService.canActOnTask(mentorId, task, PERMISSIONS.TASK_REVIEW))) {
      throw new ForbiddenError('You do not have permission to review this submission');
    }

    if (submission.status !== 'pending' && submission.status !== 'reviewing') {
      throw new ValidationError('Submission cannot be reviewed in current status');
    }

    const {
      rating,
      feedbackText,
      inlineFeedback,
      isApproved,
      revisionNotes,
      criteriaMet,
      pointsAwarded,
      decision,
      checkedCriteria
    } = reviewData;

    // Derive the explicit decision when not provided (keeps the 4-decision
    // model and the legacy isApproved boolean in sync).
    const resolvedDecision = decision || (isApproved ? 'approved' : 'changes');

    // Validate rating
    if (rating < 0 || rating > 5) {
      throw new ValidationError('Rating must be between 0 and 5');
    }

    const maxPoints = task.pointsBase ?? task.roadmapTask?.pointsBase ?? 10;

    if (isApproved && pointsAwarded !== undefined && pointsAwarded !== null) {
      const parsedPoints = Number(pointsAwarded);

      if (!Number.isFinite(parsedPoints)) {
        throw new ValidationError('Points awarded must be a valid number');
      }

      if (parsedPoints < 0) {
        throw new ValidationError('Points awarded cannot be less than 0');
      }

      if (parsedPoints > maxPoints) {
        throw new ValidationError(`Points awarded cannot be greater than maximum marks ${maxPoints}`);
      }
    }

    // Create feedback
    const feedbackType = inlineFeedback && inlineFeedback.length > 0 ? 'both' : 'general';
    
    await models.TaskFeedback.create({
      assignedTaskId: task.id,
      submissionId: submission.id,
      mentorId,
      feedbackText,
      inlineFeedback: inlineFeedback || null,
      rating,
      isApproved,
      revisionNotes: isApproved ? null : revisionNotes,
      criteriaMet: criteriaMet || null,
      decision: resolvedDecision,
      checkedCriteria: checkedCriteria || null,
      feedbackType
    });

    // Update submission status
    await submission.update({
      status: isApproved ? 'approved' : 'revision_needed',
      reviewedAt: new Date()
    });

    // Update task
    const updateData = {
      status: isApproved ? 'completed' : 'revision_needed',
      finalRating: rating
    };

    if (isApproved) {
      updateData.completedAt = new Date();
      const parsedPoints = Number(pointsAwarded);
      const safePoints = Number.isFinite(parsedPoints) ? parsedPoints : maxPoints;
      updateData.pointsAwarded = safePoints;
    } else {
      updateData.revisionCount = task.revisionCount + 1;
    }

    await task.update(updateData);

    // Auto-advance a roadmap chain FIRST (assign the next step) so the stats
    // recompute below counts it - otherwise approving the last-assigned step
    // would momentarily read 100% and flag the enrollment ready-to-complete
    // before the next step appears.
    if (isApproved) {
      try {
        const linearRoadmapService = require('./linearRoadmapService');
        await linearRoadmapService.advanceOnApproval(task.menteeId, task.roadmapTaskId);
      } catch (err) {
        console.error('Roadmap auto-advance failed (non-fatal):', err.message);
      }
    }

    // Update enrollment task stats so tasksCompleted/tasksTotal/overallProgressPercentage stay current
    const taskService = require('./taskService');
    await taskService.updateEnrollmentTaskStats(task.enrollmentId);

    // Keep gamification and mentee-profile progress in sync when a task is approved.
    if (isApproved) {
      await this.updateMenteeGamificationProgress(task.menteeId);

      const gamificationService = require('./gamificationService');
      const pointsToAward = updateData.pointsAwarded;

      try {
        if (pointsToAward > 0) {
          await gamificationService.awardPoints(
            task.menteeId,
            pointsToAward,
            'task_completed',
            task.id,
            `Task completed: "${task.title || task.id}"`
          );
        }

        await gamificationService.updateStreak(task.menteeId);

        // Re-check task-based badges after profile counters are refreshed.
        await gamificationService.checkAndAwardBadges(task.menteeId);
      } catch (gamificationError) {
        // Do not fail review flow if gamification side-effects fail.
        console.error('[Gamification] reviewSubmission side-effect failed:', {
          submissionId,
          taskId: task.id,
          menteeId: task.menteeId,
          error: gamificationError.message
        });
      }
    }

    // Update mentor stats
    await this.updateMentorReviewStats(mentorId);

    const reviewedSubmission = await this.getSubmissionById(submissionId);

    const reviewedTitle = reviewedSubmission.assignedTask?.roadmapTask?.title || 'your task';
    const ratingNum = Number(rating);
    const ratingStr = Number.isFinite(ratingNum) && ratingNum > 0 ? `${ratingNum % 1 === 0 ? ratingNum : ratingNum.toFixed(1)}★` : null;

    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.SUBMISSION_REVIEWED,
      recipients: [{ userId: task.menteeId }],
      payload: {
        title: isApproved ? `“${reviewedTitle}” approved 🎉` : `Changes requested on “${reviewedTitle}”`,
        message: isApproved
          ? `Your mentor approved “${reviewedTitle}”${ratingStr ? ` · ${ratingStr}` : ''}. Nice work - keep the momentum going.`
          : `Your mentor asked for another pass on “${reviewedTitle}”. Read their notes and resubmit when ready.`,
        actionUrl: `/mentee/tasks/${task.id}`,
        actionLabel: isApproved ? 'See review' : 'View notes & resubmit',
        relatedEntityType: 'task_submission',
        relatedEntityId: submission.id,
        emailSubject: isApproved ? `Approved: “${reviewedTitle}”` : `Revision requested: “${reviewedTitle}”`
      },
      dedupe: {
        relatedEntityType: 'submission_reviewed',
        relatedEntityId: submission.id
      }
    });

    if (feedbackText && String(feedbackText).trim()) {
      const reviewer = await models.User.findByPk(mentorId, { attributes: ['firstName', 'lastName'] });
      const reviewerName = reviewer ? `${reviewer.firstName} ${reviewer.lastName}`.trim() : 'Your mentor';
      await notificationOrchestrator.dispatch({
        eventKey: NOTIFICATION_EVENTS.FEEDBACK_SENT,
        recipients: [{ userId: task.menteeId }],
        payload: {
          title: `${reviewerName} left you feedback`,
          message: `New feedback on “${reviewedTitle}”. Take a look when you get a moment.`,
          actionUrl: `/mentee/tasks/${task.id}`,
          actionLabel: 'Read feedback',
          relatedEntityType: 'task_feedback',
          relatedEntityId: submission.id,
          emailSubject: `${reviewerName} left feedback on “${reviewedTitle}”`
        },
        dedupe: {
          relatedEntityType: 'feedback_sent',
          relatedEntityId: submission.id
        }
      });
    }

    return reviewedSubmission;
  }

  /**
   * Get submission by ID with all related data
   */
  async getSubmissionById(submissionId) {
    const submission = await models.TaskSubmission.findByPk(submissionId, {
      include: [
        {
          model: models.AssignedTask,
          as: 'assignedTask',
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
              model: models.User,
              as: 'mentor',
              attributes: ['id', 'firstName', 'lastName', 'email']
            }
          ]
        },
        {
          model: models.TaskSubmissionFile,
          as: 'files'
        },
        {
          model: models.TaskFeedback,
          as: 'feedback',
          include: [{
            model: models.User,
            as: 'mentor',
            attributes: ['id', 'firstName', 'lastName']
          }]
        }
      ]
    });

    if (!submission) {
      throw new NotFoundError('Submission not found');
    }

    return submission;
  }

  /**
   * Get all submissions for a task
   */
  async getTaskSubmissions(taskId, userId, userRole) {
    const task = await models.AssignedTask.findByPk(taskId);

    if (!task) {
      throw new NotFoundError('Task not found');
    }

    // Permissions (derived): the mentee sees their own task's submissions;
    // anyone else must be able to view the task (lead/co-mentor of the clan,
    // admin, or the assigning mentor).
    const isOwnerMentee = task.menteeId === userId;
    if (!isOwnerMentee && !(await authzService.canActOnTask(userId, task, [PERMISSIONS.MENTEE_VIEW, PERMISSIONS.TASK_REVIEW]))) {
      throw new ForbiddenError('Not authorized');
    }

    const submissions = await models.TaskSubmission.findAll({
      where: { assignedTaskId: taskId },
      include: [
        {
          model: models.TaskSubmissionFile,
          as: 'files'
        },
        {
          model: models.TaskFeedback,
          as: 'feedback',
          include: [{
            model: models.User,
            as: 'mentor',
            attributes: ['id', 'firstName', 'lastName']
          }]
        }
      ],
      order: [['version', 'DESC']]
    });

    return submissions;
  }

  /**
   * Delete file from submission
   */
  async deleteSubmissionFile(fileId, userId, userRole) {
    const file = await models.TaskSubmissionFile.findByPk(fileId, {
      include: [{
        model: models.TaskSubmission,
        as: 'submission',
        include: [{
          model: models.AssignedTask,
          as: 'assignedTask'
        }]
      }]
    });

    if (!file) {
      throw new NotFoundError('File not found');
    }

    const task = file.submission.assignedTask;

    // Only mentee can delete their own files before review
    if (userRole === 'mentee' && task.menteeId !== userId) {
      throw new ForbiddenError('Not authorized');
    }

    if (file.submission.status !== 'pending') {
      throw new ValidationError('Cannot delete files from reviewed submissions');
    }

    // Delete from Cloudinary
    // Extract the full public_id from the URL: everything after /upload/v<ver>/
    // e.g. /raw/upload/v123/pathment/submissions/<id>/file_xxx.pdf → pathment/submissions/<id>/file_xxx
    try {
      const urlParts = file.fileUrl.split('/');
      const uploadIdx = urlParts.indexOf('upload');
      const publicIdWithExt = urlParts.slice(uploadIdx + 2).join('/');
      const publicId = publicIdWithExt.replace(/\.[^/.]+$/, '');
      const cloudinaryResourceType = (file.fileType || '').startsWith('video/') ? 'video'
        : (file.fileType || '').startsWith('image/') ? 'image'
        : 'raw';
      await deleteFromCloudinary(publicId, cloudinaryResourceType);
    } catch (error) {
      console.error('Error deleting from Cloudinary:', error);
    }

    await file.destroy();

    return { message: 'File deleted successfully' };
  }

  /**
   * Update mentor review statistics
   */
  async updateMentorReviewStats(mentorId) {
    const mentor = await models.MentorProfile.findOne({
      where: { userId: mentorId }
    });

    if (!mentor) return;

    const reviewedTasks = await models.AssignedTask.count({
      where: {
        mentorId,
        status: 'completed'
      }
    });

    await mentor.update({
      totalTasksReviewed: reviewedTasks
    });
  }

  /**
   * Recalculate mentee profile counters derived from assigned tasks.
   */
  async updateMenteeGamificationProgress(menteeId) {
    const menteeProfile = await models.MenteeProfile.findOne({
      where: { userId: menteeId }
    });

    if (!menteeProfile) return;

    const completedTasks = await models.AssignedTask.findAll({
      where: {
        menteeId,
        status: 'completed'
      },
      attributes: ['finalRating']
    });

    const totalTasksCompleted = completedTasks.length;

    const ratings = completedTasks
      .map((item) => item.finalRating)
      .filter((rating) => rating !== null && rating !== undefined)
      .map((rating) => parseFloat(rating))
      .filter((rating) => Number.isFinite(rating));

    const avgTaskRating = ratings.length > 0
      ? parseFloat((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(2))
      : 0;

    await menteeProfile.update({
      totalTasksCompleted,
      avgTaskRating
    });
  }

  /**
   * The mentor's approvals queue: pending submissions across their assigned
   * tasks, shaped for the review UI (criteria checklist + submission content).
   */
  async getMentorApprovalsQueue(mentorId) {
    const submissions = await models.TaskSubmission.findAll({
      where: { status: 'pending' },
      include: [{
        model: models.AssignedTask,
        as: 'assignedTask',
        required: true,
        where: { mentorId, status: 'submitted' },
        include: [
          { model: models.RoadmapTask, as: 'roadmapTask', attributes: ['title', 'type', 'description', 'deliverable', 'acceptanceCriteria', 'pointsBase'] },
          { model: models.User, as: 'mentee', attributes: ['id', 'firstName', 'lastName', 'profilePictureUrl'] }
        ]
      }],
      order: [['submittedAt', 'ASC']]
    });

    // Collapse to ONE entry per assignment. A mentee can resubmit / request an
    // extension before review, and each of those creates a new TaskSubmission
    // version while older versions stay 'pending' — without this, the same task
    // shows up once per version in the queue (the "duplicate tasks" bug). We keep
    // the latest version (the mentee's most recent state); the mentor still sees
    // the full version thread when they open Review.
    const latestByTask = new Map();
    for (const s of submissions) {
      const prev = latestByTask.get(s.assignedTaskId);
      if (!prev || (s.version || 0) > (prev.version || 0)) latestByTask.set(s.assignedTaskId, s);
    }
    const latest = [...latestByTask.values()]
      .sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));

    // A deadline is the MENTEE's calendar day (extensions anchor end-of-day in
    // their zone), so the client needs each mentee's timezone to show/seed dates
    // in the right calendar. One batched lookup, defaulting to UTC.
    const menteeIds = [...new Set(latest.map((s) => s.assignedTask?.menteeId).filter(Boolean))];
    const tzRows = menteeIds.length
      ? await models.UserSettings.findAll({ where: { userId: { [Op.in]: menteeIds } }, attributes: ['userId', 'timezone'] })
      : [];
    const tzByUser = new Map(tzRows.map((r) => [r.userId, r.timezone || 'UTC']));

    return latest.map((s) => {
      const t = s.assignedTask;
      const m = t.mentee;
      return {
        submissionId: s.id,
        taskId: t.id,
        // Stable peer-grouping key for the client's "group by task" view. Title
        // can be per-mentee overridden, so don't group by title.
        roadmapTaskId: t.roadmapTaskId || null,
        version: s.version,
        submissionText: s.submissionText,
        submissionUrls: s.submissionUrls || [],
        submittedAt: s.submittedAt,
        isLate: t.isLate,
        // Extension-request fields — lets the client split the queue into a
        // "To review" tab (work) and an "Extension requests" tab. A pending
        // extension request is a TaskSubmission with extensionRequested=true and
        // an unresolved extensionStatus.
        isExtensionRequest: Boolean(s.extensionRequested && s.extensionStatus === 'pending'),
        extensionReason: s.extensionReason || null,
        extensionDays: s.extensionDays || null,
        dueDate: t.dueDate || null,
        menteeTimezone: tzByUser.get(t.menteeId) || 'UTC',
        // Prefer the per-mentee override so the mentor reviews exactly what the
        // mentee saw, and the max points reflect this assignment's points.
        title: t.titleOverride || t.roadmapTask?.title || 'Task',
        type: t.roadmapTask?.type || null,
        brief: t.descriptionOverride || t.roadmapTask?.description || null,
        deliverable: t.deliverableOverride || t.roadmapTask?.deliverable || null,
        criteria: (Array.isArray(t.acceptanceCriteriaOverride) && t.acceptanceCriteriaOverride.length)
          ? t.acceptanceCriteriaOverride : (t.roadmapTask?.acceptanceCriteria || []),
        maxPoints: t.pointsBase ?? t.roadmapTask?.pointsBase ?? 10,
        mentee: m ? {
          id: m.id,
          name: `${m.firstName} ${m.lastName}`.trim(),
          avatar: `${(m.firstName || '').charAt(0)}${(m.lastName || '').charAt(0)}`.toUpperCase()
        } : null
      };
    });
  }

  /**
   * Apply the SAME review decision to a set of submissions. Each goes through
   * the normal review path so points/notifications/stats all fire. Returns
   * per-submission results so the caller can report partial failure.
   */
  async bulkReview(mentorId, submissionIds = [], reviewData = {}) {
    const results = [];
    for (const submissionId of submissionIds) {
      try {
        await this.reviewSubmission(submissionId, mentorId, reviewData);
        results.push({ submissionId, ok: true });
      } catch (error) {
        results.push({ submissionId, ok: false, error: error.message });
      }
    }
    return results;
  }

  /**
   * Bulk-approve a set of submissions (used for on-time work). Delegates to
   * bulkReview with the standard approve payload.
   */
  async bulkApprove(mentorId, submissionIds = []) {
    return this.bulkReview(mentorId, submissionIds, {
      rating: 5,
      feedbackText: 'Approved.',
      isApproved: true,
      decision: 'approved'
    });
  }

  /**
   * AI-draft concise, constructive mentor feedback for a submitted task, using
   * the mentor's configured AI connection (feature: 'feedback'). The tone follows
   * `decision` (approved = affirming + a growth nudge; changes = clearly states
   * what to fix). When `count > 1` it's phrased for a GROUP (general, not "you").
   * Returns the text; bubbles the ValidationError (no AI key) so the client can
   * surface the "AI not configured" message.
   */
  async draftFeedback(mentorId, { taskTitle, brief, criteria, decision, count } = {}) {
    const n = Math.max(1, Number(count) || 1);
    const isApproved = decision === 'approved' || decision === 'approved_notes';
    const criteriaList = Array.isArray(criteria)
      ? criteria.map((c) => String(c).trim()).filter(Boolean)
      : [];

    const brief_ = [
      `Task: ${String(taskTitle || 'Submitted task').trim()}`,
      brief ? `What the task asked for: ${String(brief).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 800)}` : null,
      criteriaList.length ? `Acceptance criteria: ${criteriaList.slice(0, 12).join('; ')}` : null,
      `Decision: ${isApproved ? 'approving the work' : decision === 'rejected' ? 'rejecting the work' : 'requesting changes'}`,
      n > 1 ? `Audience: a GROUP of ${n} mentees who submitted this same task (write generally, do not address one person).` : 'Audience: the single mentee who submitted this task.',
    ].filter(Boolean).join('\n');

    const tone = isApproved
      ? 'The work is being approved. Be affirming and specific about what was done well, then add ONE concrete growth nudge for next time.'
      : decision === 'rejected'
        ? 'The work is being rejected. Be respectful but clear about why it does not meet the bar and what a passing submission would need.'
        : 'Changes are being requested. Clearly and concretely state what needs to be fixed before resubmission.';

    const audience = n > 1
      ? 'Write for the whole group in general terms (e.g. "the submissions", "this work") — never single anyone out.'
      : 'Write directly to the mentee.';

    const system =
      'You are an experienced mentor writing brief, constructive feedback on a submitted task. ' +
      'Write 2-4 sentences, warm but professional, specific and actionable. ' +
      'No headings, no bullet lists, no markdown, no preamble. Do not invent facts beyond the brief. ' +
      `${tone} ${audience}`;
    const prompt = `Here is the task context. Write the feedback.\n\n${brief_}`;

    const groqService = require('./groqService');
    return groqService.generateText({ system, prompt, feature: 'feedback', userId: mentorId, temperature: 0.6, maxTokens: 300 });
  }
}

module.exports = new SubmissionService();
