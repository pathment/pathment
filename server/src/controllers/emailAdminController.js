const { models } = require('../db');
const emailService = require('../services/emailService');

/** Queue health: counts by status + recent failures. */
exports.getEmailStats = async (req, res) => {
  const rows = await models.EmailQueue.findAll({
    attributes: ['status', [models.EmailQueue.sequelize.fn('COUNT', models.EmailQueue.sequelize.col('id')), 'count']],
    group: ['status'], raw: true,
  });
  const byStatus = rows.reduce((m, r) => (m[r.status] = Number(r.count), m), {});
  const suppressed = await models.SuppressedEmail.count();
  res.json({ success: true, data: { byStatus, suppressed } });
};

/** List dead (DLQ) / failed emails for inspection + replay. */
exports.listFailedEmails = async (req, res) => {
  const status = ['dead', 'pending', 'sent', 'sending'].includes(req.query.status) ? req.query.status : 'dead';
  const limit = Math.min(200, Number(req.query.limit) || 50);
  const rows = await models.EmailQueue.findAll({
    where: { status },
    attributes: ['id', 'recipientEmail', 'subject', 'emailType', 'status', 'attemptCount', 'maxAttempts', 'errorCategory', 'lastError', 'failedAt', 'nextAttemptAt', 'createdAt'],
    order: [['updatedAt', 'DESC']], limit,
  });
  res.json({ success: true, data: { emails: rows } });
};

/** Requeue a dead/failed email for another attempt. */
exports.retryEmail = async (req, res) => {
  const row = await models.EmailQueue.findByPk(req.params.id);
  if (!row) return res.status(404).json({ success: false, error: 'not_found' });
  await row.update({ status: 'pending', nextAttemptAt: new Date(), attemptCount: 0, failedAt: null, errorCategory: null });
  res.json({ success: true, data: { id: row.id } });
};

/** Requeue every dead email (e.g. after fixing a provider/config issue). */
exports.retryAllDead = async (req, res) => {
  const [, affected] = await models.EmailQueue.update(
    { status: 'pending', nextAttemptAt: new Date(), attemptCount: 0, failedAt: null, errorCategory: null },
    { where: { status: 'dead' } }
  );
  res.json({ success: true, data: { requeued: affected ?? null } });
};

/** Suppression list management. */
exports.listSuppressed = async (req, res) => {
  const rows = await models.SuppressedEmail.findAll({ order: [['updatedAt', 'DESC']], limit: 200 });
  res.json({ success: true, data: { suppressed: rows } });
};

exports.unsuppress = async (req, res) => {
  const email = emailService.normalizeEmail(req.params.email);
  const n = await models.SuppressedEmail.destroy({ where: { email } });
  res.json({ success: true, data: { removed: n } });
};
