const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/cloudinaryUpload');
const { models } = require('../db');
const { NotFoundError, ForbiddenError, ValidationError } = require('../utils/errors/errorTypes');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');

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
    const uploadedFiles = [];
    for (const file of files) {
      try {
        const result = await uploadToCloudinary(
          file.buffer,
          `pathment/submissions/${taskId}`,
          'auto'
        );

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

    // Update task status
    await task.update({
      status: 'submitted',
      submittedAt: new Date(),
      currentSubmissionVersion: newVersion,
      startedAt: task.startedAt || new Date(),
      isLate: task.dueDate && new Date() > new Date(task.dueDate)
    });

    // Return complete submission with files
    const fullSubmission = await this.getSubmissionById(submission.id);

    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.TASK_SUBMITTED,
      recipients: [{ userId: task.mentorId }],
      payload: {
        title: 'Task submitted for review',
        message: `A mentee submitted "${fullSubmission.assignedTask?.roadmapTask?.title || 'a task'}" for review.`,
        actionUrl: `/mentor/tasks/${task.id}/feedback`,
        actionLabel: 'Review Submission',
        relatedEntityType: 'task_submission',
        relatedEntityId: submission.id,
        emailSubject: 'Pathment: Task submitted for review'
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

    if (submission.assignedTask.mentorId !== mentorId) {
      throw new ForbiddenError('You are not the mentor for this task');
    }

    if (!submission.extensionRequested) {
      throw new ValidationError('This is not an extension request');
    }

    if (submission.extensionStatus !== 'pending') {
      throw new ValidationError('Extension request already processed');
    }

    await submission.update({
      extensionStatus: approved ? 'approved' : 'rejected',
      reviewedAt: new Date()
    });

   let finalDueDate = newDueDate;
    if (approved) {
      if (!newDueDate) {
        // Auto-calculate 3 days from the TASK'S CURRENT DUE DATE 
        const currentDueDate = new Date(submission.assignedTask.dueDate);
        currentDueDate.setDate(currentDueDate.getDate() + 3);
        finalDueDate = currentDueDate.toISOString().split('T')[0];
      }
      await submission.assignedTask.update({
        dueDate: finalDueDate
      });
    }

    //  ADD: Send notification to mentee
    const updatedSubmission = await this.getSubmissionById(submissionId);
    
    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.EXTENSION_HANDLED,
      recipients: [{ userId: submission.assignedTask.menteeId }],
      payload: {
        title: approved ? 'Extension approved' : 'Extension request rejected',
        message: approved
          ? `Your extension request for "${updatedSubmission.assignedTask?.roadmapTask?.title || 'task'}" was approved. New due date: ${finalDueDate}`
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

    if (task.mentorId !== mentorId) {
      throw new ForbiddenError('You are not the mentor for this task');
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
      pointsAwarded
    } = reviewData;

    // Validate rating
    if (rating < 0 || rating > 5) {
      throw new ValidationError('Rating must be between 0 and 5');
    }

    const maxPoints = task.roadmapTask?.pointsBase ?? 10;

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

    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.SUBMISSION_REVIEWED,
      recipients: [{ userId: task.menteeId }],
      payload: {
        title: isApproved ? 'Submission approved' : 'Submission needs revision',
        message: isApproved
          ? `Great work! Your submission for "${reviewedSubmission.assignedTask?.roadmapTask?.title || 'task'}" was approved.`
          : `Your submission for "${reviewedSubmission.assignedTask?.roadmapTask?.title || 'task'}" needs revision.`,
        actionUrl: `/mentee/tasks/${task.id}`,
        actionLabel: 'View Feedback',
        relatedEntityType: 'task_submission',
        relatedEntityId: submission.id,
        emailSubject: 'Pathment: Submission review update'
      },
      dedupe: {
        relatedEntityType: 'submission_reviewed',
        relatedEntityId: submission.id
      }
    });

    if (feedbackText && String(feedbackText).trim()) {
      await notificationOrchestrator.dispatch({
        eventKey: NOTIFICATION_EVENTS.FEEDBACK_SENT,
        recipients: [{ userId: task.menteeId }],
        payload: {
          title: 'New mentor feedback',
          message: `Your mentor left new feedback on "${reviewedSubmission.assignedTask?.roadmapTask?.title || 'task'}".`,
          actionUrl: `/mentee/tasks/${task.id}`,
          actionLabel: 'Read Feedback',
          relatedEntityType: 'task_feedback',
          relatedEntityId: submission.id,
          emailSubject: 'Pathment: New mentor feedback'
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

    // Check permissions
    if (userRole === 'mentee' && task.menteeId !== userId) {
      throw new ForbiddenError('Not authorized');
    }
    if (userRole === 'mentor' && task.mentorId !== userId) {
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
    try {
      const publicId = file.fileUrl.split('/').slice(-2).join('/').split('.')[0];
      await deleteFromCloudinary(`pathment/submissions/${task.id}/${publicId}`);
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
}

module.exports = new SubmissionService();
