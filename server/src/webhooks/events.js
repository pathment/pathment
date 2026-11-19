/**
 * Where webhook events come from: hooks on the models themselves, so every
 * path that makes a change (the app, the API, an import, a background job)
 * reports it — not just the screens someone remembered.
 *
 * Each hook asks first whether anyone in that workspace listens for the event
 * (a cached lookup) and only then builds the payload, after the transaction
 * commits, without holding up the change. Payloads use the same shapes as the
 * public API (Applicant, Mentee, Job …).
 *
 * Note: bulk `Model.update(...)` calls don't run instance hooks; the flows
 * that make these changes (accepting, submitting, approving, issuing) update
 * one record at a time.
 */
const VERIFY_BASE = process.env.CERTIFICATE_VERIFY_BASE_URL || 'https://app.pathment.me/verify';

/** Run after the transaction commits (or now, when there isn't one). Never throws. */
function later(options, fn) {
  const run = () => { Promise.resolve().then(fn).catch((e) => require('../utils/logger').error('Webhook hook failed', { message: e.message })); };
  if (options && options.transaction && typeof options.transaction.afterCommit === 'function') options.transaction.afterCommit(run);
  else setImmediate(run);
}

function emitLater(options, organizationId, type, build) {
  if (!organizationId) return;
  later(options, async () => {
    const webhooks = require('./webhookService');
    if (!(await webhooks.wants(organizationId, type))) return;
    await webhooks.emit(organizationId, type, build);
  });
}

// ── Payload builders (run inside the workspace's context) ─────────────────────
async function applicantData(applicationId) {
  const { models } = require('../db');
  const app = await models.Application.findByPk(applicationId);
  if (!app) return null;
  const [submission, invite, identity] = await Promise.all([
    models.AssessmentSubmission.findOne({ where: { applicationId: app.id }, order: [['updatedAt', 'DESC']] }),
    app.inviteId ? models.RegistrationInvite.findByPk(app.inviteId, { attributes: ['id', 'usedAt', 'createdAt'] }) : null,
    models.ExternalIdentity.findOne({ where: { applicationId: app.id }, order: [['updatedAt', 'DESC']] }),
  ]);
  const stage = require('../services/assessmentPipelineService').stageOf(app, submission || null, invite || null);
  const responses = { ...(app.responses || {}) };
  return {
    applicant: {
      id: app.id,
      intakeId: app.cohortId,
      externalId: identity && !identity.externalId.startsWith('email:') ? identity.externalId : null,
      email: app.email,
      firstName: app.firstName || null,
      lastName: app.lastName || null,
      phone: app.phone || null,
      level: app.level || null,
      country: typeof responses.country === 'string' ? responses.country : null,
      status: app.status,
      stage,
      responses,
      source: app.source,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
    },
    ...(submission && submission.status !== 'in_progress' ? {
      assessment: {
        submittedAt: submission.submittedAt || null,
        score: submission.totalScore != null ? Number(submission.totalScore) : null,
        maxScore: submission.maxScore != null ? Number(submission.maxScore) : null,
      },
    } : {}),
  };
}

async function programmeOfEnrollment(enrollmentId) {
  if (!enrollmentId) return null;
  const { models } = require('../db');
  const e = await models.Enrollment.findByPk(enrollmentId, { attributes: ['programId'] });
  return e ? e.programId : null;
}

// ── The hooks ───────────────────────────────────────────────────────────────────
function install(models) {
  if (!models.WebhookDelivery || install.done) return;
  install.done = true;

  models.Application.addHook('afterCreate', 'webhooks', (app, options) => {
    emitLater(options, app.organizationId, 'applicant.created', () => applicantData(app.id));
  });
  models.Application.addHook('afterUpdate', 'webhooks', (app, options) => {
    if (!app.changed('status')) return;
    const type = { assessment_sent: 'applicant.assessment_sent', accepted: 'applicant.accepted', rejected: 'applicant.rejected' }[app.status];
    if (type) emitLater(options, app.organizationId, type, () => applicantData(app.id));
  });

  const submitted = (sub, options) => emitLater(options, sub.organizationId, 'applicant.assessment_submitted', () => applicantData(sub.applicationId));
  // Created already submitted (no timed attempt), or an attempt moving out of in_progress.
  models.AssessmentSubmission.addHook('afterCreate', 'webhooks', (sub, options) => {
    if (sub.applicationId && sub.status !== 'in_progress') submitted(sub, options);
  });
  models.AssessmentSubmission.addHook('afterUpdate', 'webhooks', (sub, options) => {
    if (!sub.applicationId || !sub.changed('status') || sub.status === 'in_progress') return;
    if (sub.previous('status') !== 'in_progress') return; // grading or re-saving, not a first submission
    submitted(sub, options);
  });

  const joined = (m, options) => {
    emitLater(options, m.organizationId, 'mentee.joined', async () => {
      const reads = require('../publicApi/readService');
      const clan = await models.Clan.findByPk(m.clanId, { attributes: ['id', 'name', 'programId'] });
      const mentee = await reads.mentee(m.userId);
      if (!mentee) return null;
      return { mentee, clan: clan ? { id: clan.id, name: clan.name, programmeId: clan.programId } : null };
    });
  };
  models.ClanMembership.addHook('afterCreate', 'webhooks', (m, options) => {
    if (m.role === 'mentee' && m.status === 'active') joined(m, options);
  });
  models.ClanMembership.addHook('afterUpdate', 'webhooks', (m, options) => {
    if (m.role !== 'mentee' || m.status !== 'active') return;
    const becameActive = m.changed('status') && m.previous('status') !== 'active' && m.previous('status') !== 'paused';
    const becameMentee = m.changed('role') && m.previous('role') !== 'mentee';
    if (becameActive || becameMentee) joined(m, options);
  });

  models.AssignedTask.addHook('afterUpdate', 'webhooks', (task, options) => {
    if (!task.changed('status') || task.status !== 'completed') return;
    emitLater(options, task.organizationId, 'task.approved', async () => {
      const step = task.roadmapTaskId ? await models.RoadmapTask.findByPk(task.roadmapTaskId, { attributes: ['title', 'type', 'roadmapId'] }) : null;
      return {
        menteeId: task.menteeId,
        task: {
          id: task.id,
          title: step?.title || task.title || null,
          type: step?.type || task.type || null,
          roadmapId: step?.roadmapId || null,
          programmeId: await programmeOfEnrollment(task.enrollmentId),
          clanId: task.clanId || null,
          approvedAt: task.completedAt || new Date().toISOString(),
        },
      };
    });
  });

  models.RoadmapProgress.addHook('afterUpdate', 'webhooks', (p, options) => {
    if (!p.changed('completed') || !p.completed) return;
    emitLater(options, p.organizationId, 'roadmap.completed', async () => {
      const roadmap = await models.Roadmap.findByPk(p.roadmapId, { attributes: ['id', 'name', 'programId'] });
      return {
        menteeId: p.menteeId,
        roadmap: roadmap ? { id: roadmap.id, name: roadmap.name } : { id: p.roadmapId, name: null },
        programmeId: roadmap?.programId || null,
        clanId: p.clanId || null,
        completedAt: new Date().toISOString(),
      };
    });
  });

  models.CertificateInstance.addHook('afterCreate', 'webhooks', (c, options) => {
    emitLater(options, c.organizationId, 'certificate.issued', async () => {
      const template = await models.CertificateTemplate.findByPk(c.templateId, { attributes: ['programId'] });
      return {
        menteeId: c.menteeId,
        programmeId: template?.programId || null,
        certificate: {
          number: c.certificateNumber || null,
          tier: c.tier,
          issuedAt: c.createdAt,
          verifyUrl: c.certificateNumber ? `${VERIFY_BASE}/${encodeURIComponent(c.certificateNumber)}` : null,
        },
      };
    });
  });
}

module.exports = { install, applicantData };
