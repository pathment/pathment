const { Op } = require('sequelize');
const { models } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');

const STATUS_LABELS = {
  open: 'Open', in_review: 'In review', planned: 'Planned',
  fixed: 'Fixed', added: 'Added', declined: 'Declined',
};
const VALID_STATUSES = Object.keys(STATUS_LABELS);
const TYPE_LABELS = { bug: 'Bug', suggestion: 'Suggestion', other: 'Feedback' };

/**
 * feedbackReportService - in-app feedback / bug reports. Anyone submits (with an
 * optional screenshot/clip + auto-captured page context); admins triage through
 * a status and reply; the reporter is notified on every change.
 */
class FeedbackReportService {
  _name(u) { return u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Someone' : 'Someone'; }

  /** Active base-role admins (who triage), for the "new report" ping. */
  async _adminRecipientIds() {
    const admins = await models.User.findAll({ where: { role: 'admin', status: 'active' }, attributes: ['id'], raw: true });
    return admins.map((a) => a.id);
  }

  _shape(r) {
    return {
      id: r.id,
      type: r.type, typeLabel: TYPE_LABELS[r.type] || r.type,
      title: r.title, description: r.description,
      status: r.status, statusLabel: STATUS_LABELS[r.status] || r.status,
      priority: r.priority,
      pageUrl: r.pageUrl, userAgent: r.userAgent,
      attachmentUrl: r.attachmentUrl, attachmentType: r.attachmentType, attachmentName: r.attachmentName,
      resolutionNote: r.resolutionNote,
      reporter: r.reporter ? { id: r.reporter.id, name: this._name(r.reporter), email: r.reporter.email, role: r.reporterRole } : null,
      handledAt: r.handledAt,
      createdAt: r.createdAt, updatedAt: r.updatedAt,
    };
  }

  // ── create (any authenticated user) ───────────────────────────────────────
  async create(reporter, data = {}) {
    const title = String(data.title || '').trim().slice(0, 200);
    if (!title) throw new ValidationError('A short title is required');
    const type = ['bug', 'suggestion', 'other'].includes(data.type) ? data.type : 'bug';

    const report = await models.FeedbackReport.create({
      reporterId: reporter.id,
      reporterRole: reporter.role || null,
      type,
      title,
      description: data.description ? String(data.description).slice(0, 5000) : null,
      status: 'open',
      priority: 'normal',
      pageUrl: data.pageUrl ? String(data.pageUrl).slice(0, 500) : null,
      userAgent: data.userAgent ? String(data.userAgent).slice(0, 500) : null,
      attachmentUrl: data.attachmentUrl || null,
      attachmentType: data.attachmentType || null,
      attachmentName: data.attachmentName || null,
    });

    // Ping admins so triage isn't missed (in-app only).
    try {
      const adminIds = await this._adminRecipientIds();
      if (adminIds.length) {
        await notificationOrchestrator.dispatch({
          eventKey: NOTIFICATION_EVENTS.FEEDBACK_SUBMITTED,
          recipients: adminIds.map((userId) => ({ userId })),
          payload: {
            title: `New ${TYPE_LABELS[type].toLowerCase()}: ${title}`,
            message: `${this._name(reporter)} reported ${type === 'bug' ? 'a bug' : type === 'suggestion' ? 'a suggestion' : 'feedback'}. Open the feedback board to review.`,
            actionUrl: '/admin/feedback',
            actionLabel: 'Open feedback',
          },
        });
      }
    } catch (e) {
      console.error('[feedback] admin notify failed (non-fatal):', e.message);
    }

    return this._shape(report);
  }

  // ── reporter's own reports ────────────────────────────────────────────────
  async listMine(userId) {
    const rows = await models.FeedbackReport.findAll({
      where: { reporterId: userId },
      order: [['created_at', 'DESC']],
    });
    return rows.map((r) => this._shape(r));
  }

  // ── admin triage list ─────────────────────────────────────────────────────
  async listAll({ status, type, page = 1, limit = 25 } = {}) {
    const where = {};
    if (status && VALID_STATUSES.includes(status)) where.status = status;
    if (type && ['bug', 'suggestion', 'other'].includes(type)) where.type = type;
    const parsedLimit = Math.min(100, Math.max(1, Number(limit) || 25));
    const parsedPage = Math.max(1, Number(page) || 1);
    const { rows, count } = await models.FeedbackReport.findAndCountAll({
      where,
      include: [{ model: models.User, as: 'reporter', attributes: ['id', 'firstName', 'lastName', 'email'] }],
      order: [['created_at', 'DESC']],
      limit: parsedLimit,
      offset: (parsedPage - 1) * parsedLimit,
    });
    // Open/unresolved counts for the header chips.
    const openCount = await models.FeedbackReport.count({ where: { status: { [Op.in]: ['open', 'in_review'] } } });
    return { reports: rows.map((r) => this._shape(r)), total: count, page: parsedPage, limit: parsedLimit, openCount };
  }

  // ── admin: update status / reply ──────────────────────────────────────────
  async updateStatus(adminUser, id, { status, resolutionNote, priority } = {}) {
    const report = await models.FeedbackReport.findByPk(id, {
      include: [{ model: models.User, as: 'reporter', attributes: ['id', 'firstName', 'lastName', 'email'] }],
    });
    if (!report) throw new NotFoundError('Feedback report not found');

    const prevStatus = report.status;
    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) throw new ValidationError('Invalid status');
      report.status = status;
    }
    if (priority !== undefined && ['low', 'normal', 'high'].includes(priority)) report.priority = priority;
    if (resolutionNote !== undefined) report.resolutionNote = resolutionNote ? String(resolutionNote).slice(0, 5000) : null;
    report.handledBy = adminUser.id;
    report.handledAt = new Date();
    await report.save();

    // Notify the reporter when the status actually changed (in-app + email).
    const statusChanged = status !== undefined && status !== prevStatus;
    if (statusChanged && report.reporter) {
      try {
        const label = STATUS_LABELS[report.status];
        const note = report.resolutionNote ? ` — "${report.resolutionNote}"` : '';
        await notificationOrchestrator.dispatch({
          eventKey: NOTIFICATION_EVENTS.FEEDBACK_STATUS_UPDATED,
          recipients: [{ userId: report.reporterId }],
          payload: {
            title: `Your feedback is now: ${label}`,
            message: `"${report.title}" was updated to ${label}${note}. Thanks for helping us improve Pathment.`,
            emailSubject: `Update on your feedback: ${label}`,
            // No relatedEntityId so each status change notifies (not deduped).
          },
        });
      } catch (e) {
        console.error('[feedback] reporter notify failed (non-fatal):', e.message);
      }
    }

    return this._shape(report);
  }
}

module.exports = new FeedbackReportService();
