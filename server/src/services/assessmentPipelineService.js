/**
 * The intake assessment pipeline: where each applicant is, and sending them
 * their assessment.
 *
 *   added → assessment sent → opened → in progress → submitted → reviewed
 *         → accepted → invited to the programme → joined
 *   (or removed / rejected / withdrawn)
 *
 * An applicant arrives by applying or from an imported sheet. "Send assessment"
 * picks the assessment for their level (the intake's level pool), gives them a
 * fresh private link, and emails it. Each step after that is stamped where it
 * happens (opening the link, starting, submitting, grading, accepting), so the
 * admin's list shows exactly where everyone is and when they got there.
 */
const { models } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');
const { generateRandomToken, hashToken } = require('../utils/jwt');

const ACCESS_TOKEN_TTL_DAYS = 60;
const CLOSED = ['removed', 'rejected', 'withdrawn'];

const STAGES = [
  { key: 'added', label: 'Added' },
  { key: 'assessment_sent', label: 'Assessment sent' },
  { key: 'opened', label: 'Opened' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'reviewed', label: 'Reviewed' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'programme_invited', label: 'Invited to programme' },
  { key: 'joined', label: 'Joined' },
];

/**
 * Where an applicant is in the pipeline. `submission` is their assessment
 * submission (or null); `invite` their programme invitation (or null).
 */
function stageOf(app, submission = null, invite = null) {
  if (CLOSED.includes(app.status)) return app.status;
  if (app.status === 'accepted') {
    if (app.userId || invite?.usedAt) return 'joined';
    if (app.inviteId) return 'programme_invited';
    return 'accepted';
  }
  if (submission?.status === 'graded') return 'reviewed';
  if (submission && submission.status !== 'in_progress') return 'submitted';
  if (submission?.startedAt || app.assessmentStartedAt) return 'in_progress';
  if (app.assessmentInvitedAt && app.linkOpenedAt && new Date(app.linkOpenedAt) >= new Date(app.assessmentInvitedAt)) return 'opened';
  if (app.assessmentInvitedAt || app.status === 'assessment_sent') return 'assessment_sent';
  return 'added';
}

/** The dated steps an applicant has passed, for the admin's timeline. */
function timelineOf(app, submission = null, invite = null) {
  return [
    { key: 'added', at: app.createdAt },
    { key: 'assessment_sent', at: app.assessmentInvitedAt, count: app.assessmentInviteCount || 0 },
    { key: 'opened', at: app.linkOpenedAt },
    { key: 'in_progress', at: submission?.startedAt || app.assessmentStartedAt },
    { key: 'submitted', at: submission && submission.status !== 'in_progress' ? submission.submittedAt : null },
    { key: 'reviewed', at: submission?.status === 'graded' ? submission.gradedAt : null },
    { key: 'accepted', at: app.status === 'accepted' ? app.decidedAt : null },
    { key: 'programme_invited', at: invite?.createdAt || null },
    { key: 'joined', at: invite?.usedAt || null },
  ].map((step) => ({ ...step, label: STAGES.find((s) => s.key === step.key).label }));
}

class AssessmentPipelineService {
  constructor() {
    this.STAGES = STAGES;
    this.stageOf = stageOf;
    this.timelineOf = timelineOf;
  }

  /**
   * Send (or re-send) each applicant the assessment for their level, with a
   * fresh private link. Returns what happened to each, so a 300-row send can
   * be read: sent, or skipped with the reason.
   */
  async sendInvites(cohortId, applicationIds, actor) {
    const cohort = await models.Cohort.findByPk(cohortId, {
      include: [{ model: models.Program, as: 'program', attributes: ['id', 'name'] }],
    });
    if (!cohort) throw new NotFoundError('Cohort not found');
    const ids = [...new Set((applicationIds || []).filter(Boolean))];
    if (!ids.length) throw new ValidationError('Choose who to send the assessment to');
    if (ids.length > 1000) throw new ValidationError('Send at most 1,000 at a time');

    const assessmentService = require('./assessmentService');
    const publicIntakeService = require('./publicIntakeService');
    const sent = [];
    const skipped = [];
    for (const id of ids) {
      // eslint-disable-next-line no-await-in-loop
      const app = await models.Application.findOne({ where: { id, cohortId } });
      if (!app) { skipped.push({ id, reason: 'Not in this intake' }); continue; }
      const who = { id, email: app.email };
      if (CLOSED.includes(app.status)) { skipped.push({ ...who, reason: `Application is ${app.status}` }); continue; }

      // eslint-disable-next-line no-await-in-loop
      const assessmentId = await assessmentService.ensureAssignedAssessment(app, cohort);
      if (!assessmentId) {
        skipped.push({ ...who, reason: app.level ? `No assessment set up for the ${app.level} level` : 'No assessment set up for this intake' });
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const done = await models.AssessmentSubmission.findOne({ where: { assessmentId, applicationId: app.id }, attributes: ['status'] });
      if (done && done.status !== 'in_progress') { skipped.push({ ...who, reason: 'Already submitted' }); continue; }

      // eslint-disable-next-line no-await-in-loop
      const assessment = await models.Assessment.findByPk(assessmentId, { attributes: ['id', 'title', 'timeLimitMins', 'enforceTimeLimit', 'proctored', 'status'] });
      if (!assessment || assessment.status !== 'published') {
        skipped.push({ ...who, reason: `"${assessment?.title || 'The assessment'}" isn't published yet` });
        continue;
      }

      // A fresh private link each time: the newest email's link is the one that works.
      const rawToken = generateRandomToken();
      // eslint-disable-next-line no-await-in-loop
      await app.update({
        accessTokenHash: hashToken(rawToken),
        accessTokenExpiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
        assessmentInvitedAt: new Date(),
        assessmentInviteCount: (app.assessmentInviteCount || 0) + 1,
        status: ['pending', 'under_review', 'waitlisted'].includes(app.status) && !done ? 'assessment_sent' : app.status,
      });
      const link = publicIntakeService.buildStatusUrl(rawToken);
      try {
        // eslint-disable-next-line no-await-in-loop
        const delivery = await this._email(app, cohort, assessment, link, actor);
        // A suppressed (bounced) address or mail not configured: their link works,
        // but the email won't reach them — say so rather than report a plain success.
        const warning = delivery && delivery.dead ? `Email not delivered (${delivery.reason || 'undeliverable'})` : null;
        sent.push({ ...who, assessment: assessment.title, resent: app.assessmentInviteCount > 1, ...(warning ? { warning } : {}) });
      } catch (error) {
        skipped.push({ ...who, reason: `Email failed: ${error.message}` });
      }
    }
    return { sent, skipped, total: ids.length };
  }

  async _email(app, cohort, assessment, link) {
    const emailService = require('./emailService');
    const programName = cohort.program?.name || 'the programme';
    const deadline = cohort.assessmentDeadline || cohort.applyClosesAt;
    const notes = [];
    if (assessment.timeLimitMins) {
      notes.push(assessment.enforceTimeLimit
        ? `It is timed: you have ${assessment.timeLimitMins} minutes once you start, so begin when you have that time free.`
        : `It takes about ${assessment.timeLimitMins} minutes.`);
    }
    if (assessment.proctored) {
      notes.push('It is proctored: take it on a laptop or desktop (Chrome, Edge or Firefox), with your camera on and your entire screen shared.');
    }
    if (deadline) notes.push(`Please complete it by ${new Date(deadline).toUTCString().replace(' GMT', ' UTC')}.`);
    const name = app.firstName ? ` ${app.firstName}` : '';
    const text = [
      `Hi${name},`,
      `You're invited to take the ${assessment.title} assessment for ${programName}${cohort.name ? ` (${cohort.name})` : ''}.`,
      ...notes,
      `Start here: ${link}`,
      'This link is personal to you — please don\'t share it.',
    ].join('\n\n');
    const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#1e293b;line-height:1.6">
      <h2 style="color:#0052D6;margin:0 0 12px">Your assessment is ready</h2>
      <p>Hi${name},</p>
      <p>You're invited to take the <strong>${assessment.title}</strong> assessment for <strong>${programName}</strong>${cohort.name ? ` (${cohort.name})` : ''}.</p>
      ${notes.map((n) => `<p>${n}</p>`).join('')}
      <p style="margin:24px 0"><a href="${link}" style="background:#0066FF;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">Start my assessment</a></p>
      <p style="color:#64748b;font-size:13px">This link is personal to you — please don't share it.</p>
    </div>`;
    return emailService.sendEmail({
      to: app.email,
      subject: `Your assessment for ${programName}`,
      html,
      text,
      emailType: 'intake_assessment_invite',
    });
  }
}

module.exports = new AssessmentPipelineService();
