const { Op } = require('sequelize');
const { models } = require('../db');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');

class NotificationScheduler {
  start() {
    const intervalMs = Number(process.env.NOTIFICATION_SCHEDULER_INTERVAL_MS || 60 * 60 * 1000);

    // Run once after startup.
    this.run().catch((error) => {
      console.error('notification scheduler startup run failed:', error.message);
    });

    setInterval(() => {
      this.run().catch((error) => {
        console.error('notification scheduler run failed:', error.message);
      });
    }, intervalMs);
  }

  async run() {
    await this.notifyDeadlineApproaching();
    await this.notifyDeadlinePassed();
    await this.sendWeeklyProgressReports();
    await this.postWeeklyStandups();
    await this.sendReengagementReminders();
  }

  /** Win-back reminders to paused mentees, on the configured cadence. */
  async sendReengagementReminders() {
    try {
      const pauseService = require('./mentorshipPauseService');
      const sent = await pauseService.runReengagement();
      if (sent) console.log(`[scheduler] sent ${sent} re-engagement reminder(s)`);
    } catch (error) {
      console.error('re-engagement reminder run failed:', error.message);
    }
  }

  async notifyDeadlineApproaching() {
    const now = new Date();
    const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const tasks = await models.AssignedTask.findAll({
      where: {
        dueDate: { [Op.gte]: now, [Op.lte]: next24h },
        status: { [Op.in]: ['assigned', 'in_progress', 'submitted', 'revision_needed'] }
      },
      include: [
        { model: models.User, as: 'mentee', attributes: ['id', 'firstName'] },
        { model: models.RoadmapTask, as: 'roadmapTask', attributes: ['id', 'title'] }
      ],
      limit: 200
    });

    for (const task of tasks) {
      await notificationOrchestrator.dispatch({
        eventKey: NOTIFICATION_EVENTS.TASK_DEADLINE_APPROACHING,
        recipients: [{ userId: task.menteeId }],
        payload: {
          title: 'Task deadline approaching',
          message: `"${task.roadmapTask?.title || 'Task'}" is due soon.`,
          actionUrl: `/mentee/tasks/${task.id}`,
          actionLabel: 'Open Task',
          relatedEntityType: 'assigned_task',
          relatedEntityId: task.id,
          emailSubject: 'Pathment: Task deadline approaching'
        },
        dedupe: {
          relatedEntityType: 'assigned_task',
          relatedEntityId: task.id
        }
      });
    }
  }

  async notifyDeadlinePassed() {
    const now = new Date();

    const tasks = await models.AssignedTask.findAll({
      where: {
        dueDate: { [Op.lt]: now },
        status: { [Op.in]: ['assigned', 'in_progress', 'submitted', 'revision_needed'] }
      },
      include: [
        { model: models.RoadmapTask, as: 'roadmapTask', attributes: ['id', 'title'] }
      ],
      limit: 200
    });

    for (const task of tasks) {
      // In-app for mentee
      await notificationOrchestrator.dispatch({
        eventKey: NOTIFICATION_EVENTS.SUBMISSION_DEADLINE_PASSED,
        recipients: [{ userId: task.menteeId }],
        payload: {
          title: 'Task deadline passed',
          message: `Deadline passed for "${task.roadmapTask?.title || 'Task'}".`,
          actionUrl: `/mentee/tasks/${task.id}`,
          actionLabel: 'Open Task',
          relatedEntityType: 'assigned_task',
          relatedEntityId: task.id,
          emailSubject: 'Pathment: Submission deadline passed'
        },
        channelOverrides: {
          inApp: true,
          email: false
        },
        dedupe: {
          relatedEntityType: 'assigned_task',
          relatedEntityId: task.id
        }
      });

      // Full channels for mentor
      await notificationOrchestrator.dispatch({
        eventKey: NOTIFICATION_EVENTS.SUBMISSION_DEADLINE_PASSED,
        recipients: [{ userId: task.mentorId }],
        payload: {
          title: 'Task deadline passed',
          message: `Deadline passed for "${task.roadmapTask?.title || 'Task'}".`,
          actionUrl: `/mentor/tasks/${task.id}`,
          actionLabel: 'Review Task',
          relatedEntityType: 'assigned_task',
          relatedEntityId: task.id,
          emailSubject: 'Pathment: Submission deadline passed'
        },
        dedupe: {
          relatedEntityType: 'assigned_task',
          relatedEntityId: task.id
        }
      });
    }
  }

  async sendWeeklyProgressReports() {
    const day = Number(process.env.WEEKLY_REPORT_DAY || 1); // 1 Monday
    const hour = Number(process.env.WEEKLY_REPORT_HOUR_UTC || 8);
    const now = new Date();

    if (now.getUTCDay() !== day || now.getUTCHours() !== hour) {
      return;
    }

    const mentees = await models.User.findAll({
      where: { role: 'mentee', status: 'active' },
      attributes: ['id', 'firstName']
    });

    for (const mentee of mentees) {
      const enrollments = await models.Enrollment.findAll({
        where: {
          menteeId: mentee.id,
          status: { [Op.in]: ['matched', 'active', 'pending_completion'] }
        },
        attributes: ['overallProgressPercentage']
      });

      if (!enrollments.length) {
        continue;
      }

      const avg = Math.round(
        enrollments.reduce((sum, e) => sum + (Number(e.overallProgressPercentage) || 0), 0) /
        enrollments.length
      );

      await notificationOrchestrator.dispatch({
        eventKey: NOTIFICATION_EVENTS.WEEKLY_PROGRESS_REPORT,
        recipients: [{ userId: mentee.id }],
        payload: {
          title: 'Weekly progress report',
          message: `Your current average progress is ${avg}%. Keep going!`,
          emailSubject: 'Your weekly Pathment progress report',
          emailText: `Hi ${mentee.firstName || ''}, your average program progress this week is ${avg}%.`
        },
        dedupe: {
          relatedEntityType: 'weekly_progress_report',
          relatedEntityId: `${mentee.id}:${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}`
        }
      });
    }
  }

  /**
   * Weekly clan standup prompt - auto-posts a 'standup' post into every active
   * clan's community space so each squad has a recurring check-in thread. The
   * post is authored by the clan's lead mentor (falling back to its creator).
   * Idempotent: skips a clan that already has a standup posted in the last 6 days.
   */
  async postWeeklyStandups() {
    const day = Number(process.env.COMMUNITY_STANDUP_DAY || 1); // 1 Monday
    const hour = Number(process.env.COMMUNITY_STANDUP_HOUR_UTC || 9);
    const now = new Date();
    if (now.getUTCDay() !== day || now.getUTCHours() !== hour) return;
    await this._postStandupsToActiveClans();
  }

  /**
   * The standup work, factored out so it can be invoked/tested without the time
   * gate. Pass `clanIds` to restrict to specific clans (used by tests); omit to
   * cover every active clan.
   */
  async _postStandupsToActiveClans(clanIds = null) {
    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    const where = { status: 'active' };
    if (Array.isArray(clanIds) && clanIds.length) where.id = { [Op.in]: clanIds };
    const clans = await models.Clan.findAll({
      where,
      attributes: ['id', 'name', 'leadMentorId', 'createdBy']
    });

    let posted = 0;
    for (const clan of clans) {
      const authorId = clan.leadMentorId || clan.createdBy;
      if (!authorId) continue;

      const recent = await models.CommunityPost.findOne({
        where: {
          scopeType: 'clan',
          scopeId: clan.id,
          type: 'standup',
          deletedAt: null,
          createdAt: { [Op.gte]: sixDaysAgo }
        }
      });
      if (recent) continue;

      await models.CommunityPost.create({
        authorId,
        type: 'standup',
        scopeType: 'clan',
        scopeId: clan.id,
        title: 'Weekly standup',
        body: 'Drop your update 👇\n• What did you ship last week?\n• What are you working on this week?\n• Anything blocking you?'
      });
      posted += 1;
    }
    return posted;
  }
}

module.exports = new NotificationScheduler();
