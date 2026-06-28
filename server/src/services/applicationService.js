const { models } = require('../db');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors/errorTypes');
const { createAuditLog } = require('../utils/auditContext');
const adminService = require('./adminService');
const cohortIntakeService = require('./cohortIntakeService');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DECIDED = ['accepted', 'rejected'];

function pick(row, keys) {
  for (const k of keys) {
    const v = row[k] ?? row[k.toLowerCase()] ?? row[k.replace(/([A-Z])/g, '_$1').toLowerCase()];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return null;
}

/**
 * Application intake: importing, reviewing, and converting accepted applicants
 * into placed invites. The full intake answers live in `responses` (JSONB);
 * only the operational subset is normalized onto MenteeProfile at accept time.
 */
class ApplicationService {
  async listApplications(cohortId, { status } = {}) {
    const cohort = await models.Cohort.findByPk(cohortId);
    if (!cohort) throw new NotFoundError('Cohort not found');

    const where = { cohortId };
    if (status) where.status = status;

    return models.Application.findAll({
      where,
      include: [
        { model: models.User, as: 'reviewer', attributes: ['id', 'firstName', 'lastName'] },
        { model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] }
      ],
      order: [['createdAt', 'DESC']]
    });
  }

  /**
   * Import rows (header→value objects, parsed client-side) into a cohort.
   * Idempotent: upsert by (cohortId, email). Already-decided applications are
   * left untouched. Unknown columns are preserved in `responses`.
   */
  async importApplications(cohortId, rows, importedBy, { allowExceed = false } = {}) {
    const cohort = await models.Cohort.findByPk(cohortId, {
      include: [{ model: models.Program, as: 'program', attributes: ['id', 'name'] }]
    });
    if (!cohort) throw new NotFoundError('Cohort not found');
    if (!Array.isArray(rows) || rows.length === 0) throw new ValidationError('No rows to import');

    const report = { created: 0, updated: 0, skipped: [] };
    const seen = new Set();

    // Respect the application cap: new rows beyond it are skipped (an admin can
    // re-run with allowExceed to override). Updates to existing rows never count.
    const cap = cohort.maxApplications != null ? Number(cohort.maxApplications) : null;
    let count = cap != null ? await models.Application.count({ where: { cohortId } }) : 0;
    let hitCap = false;

    for (const raw of rows) {
      const row = raw || {};
      const email = (pick(row, ['email']) || '').toLowerCase();

      if (!EMAIL_RE.test(email)) {
        report.skipped.push({ email: email || '(blank)', reason: 'Invalid or missing email' });
        continue;
      }
      if (seen.has(email)) {
        report.skipped.push({ email, reason: 'Duplicate row in file' });
        continue;
      }
      seen.add(email);

      const nameWhole = pick(row, ['name', 'fullName', 'full_name']);
      const firstName = pick(row, ['firstName', 'first_name', 'firstname']) || (nameWhole ? nameWhole.split(' ')[0] : null);
      const lastName = pick(row, ['lastName', 'last_name', 'lastname']) || (nameWhole ? nameWhole.split(' ').slice(1).join(' ') || null : null);
      const phone = pick(row, ['phone', 'phoneNumber', 'phone_number', 'mobile']);
      const programPreference = pick(row, ['programPreference', 'program_preference', 'program', 'programChoice', 'program_choice']);

      const fields = {
        email,
        firstName,
        lastName,
        phone,
        programPreference,
        source: 'import',
        responses: row
      };

      const existing = await models.Application.findOne({ where: { cohortId, email } });
      if (existing) {
        if (DECIDED.includes(existing.status)) {
          report.skipped.push({ email, reason: `Already ${existing.status}` });
          continue;
        }
        await existing.update(fields);
        report.updated += 1;
      } else {
        if (cap != null && !allowExceed && count >= cap) {
          hitCap = true;
          report.skipped.push({ email, reason: `Cohort at its application cap (${cap})` });
          continue;
        }
        await models.Application.create({ cohortId, ...fields });
        report.created += 1;
        count += 1;
      }
    }

    // Alert admins if this import filled the cohort (or tried to exceed it).
    if (cap != null && (hitCap || count >= cap)) {
      cohortIntakeService.notifyCapacityReached(cohort, count).catch(() => {});
    }
    report.capReached = cap != null && count >= cap;

    if (report.created > 0 || report.updated > 0) {
      await createAuditLog({
        userId: importedBy,
        action: 'APPLICATIONS_IMPORTED',
        entityType: 'Cohort',
        entityId: cohortId,
        newValues: { created: report.created, updated: report.updated, skipped: report.skipped.length }
      }).catch(() => {});
    }

    return report;
  }

  /** Full application detail for admin review, including any assessment submission. */
  async getApplication(applicationId) {
    const app = await models.Application.findByPk(applicationId, {
      include: [
        { model: models.Cohort, as: 'cohort', include: [{ model: models.Program, as: 'program', attributes: ['id', 'name'] }] },
        { model: models.User, as: 'reviewer', attributes: ['id', 'firstName', 'lastName'] }
      ]
    });
    if (!app) throw new NotFoundError('Application not found');

    let assessment = null;
    let submission = null;
    const cohort = app.cohort;
    // Show the assessment the applicant was ACTUALLY assigned (pool/level aware),
    // falling back to the cohort's legacy single assessment.
    const assessmentId = app.assignedAssessmentId || cohort?.assessmentId;
    if (assessmentId) {
      assessment = await models.Assessment.findByPk(assessmentId, {
        include: [{ model: models.AssessmentQuestion, as: 'questions' }]
      });
      submission = await models.AssessmentSubmission.findOne({
        where: { assessmentId, applicationId: app.id }
      });
    }

    return {
      application: app,
      assessment: assessment ? assessment.toJSON() : null,
      submission: submission ? submission.toJSON() : null
    };
  }

  async createApplication(cohortId, data) {
    const cohort = await models.Cohort.findByPk(cohortId);
    if (!cohort) throw new NotFoundError('Cohort not found');

    const email = (data.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new ValidationError('A valid email is required');

    const existing = await models.Application.findOne({ where: { cohortId, email } });
    if (existing) throw new ConflictError('An application with this email already exists in the cohort');

    return models.Application.create({
      cohortId,
      email,
      firstName: data.firstName || null,
      lastName: data.lastName || null,
      phone: data.phone || null,
      programPreference: data.programPreference || null,
      source: 'manual',
      responses: data.responses || {}
    });
  }

  async updateApplication(applicationId, data, reviewerId) {
    const app = await models.Application.findByPk(applicationId);
    if (!app) throw new NotFoundError('Application not found');

    const patch = {};
    if (data.status !== undefined) patch.status = data.status;
    if (data.assessmentScore !== undefined) patch.assessmentScore = data.assessmentScore;
    if (data.reviewerNotes !== undefined) patch.reviewerNotes = data.reviewerNotes;
    // The applicant-facing decision reason (editable after a decision).
    if (data.decisionReason !== undefined) patch.decisionReason = data.decisionReason;
    if (Object.keys(patch).length) {
      patch.reviewedBy = reviewerId;
    }
    await app.update(patch);
    return app;
  }

  /**
   * Accept an application → issue a mentee invite placed into the cohort's
   * program (and an optional clan). The invite carries the cohort so the
   * eventual enrollment is traceable back to this intake.
   */
  async acceptApplication(applicationId, { clanId } = {}, acceptedBy) {
    const app = await models.Application.findByPk(applicationId, {
      include: [{ model: models.Cohort, as: 'cohort' }]
    });
    if (!app) throw new NotFoundError('Application not found');
    if (app.status === 'accepted') throw new ConflictError('Application is already accepted');

    const cohort = app.cohort;
    if (!cohort) throw new ValidationError('Application is not attached to a cohort');

    const invite = await adminService.createRegistrationInvite({
      email: app.email,
      role: 'mentee',
      programId: cohort.programId,
      clanId: clanId || undefined,
      cohortId: cohort.id
    }, acceptedBy);

    await app.update({
      status: 'accepted',
      decidedAt: new Date(),
      reviewedBy: acceptedBy,
      inviteId: invite.id
    });

    return { application: app, invite };
  }

  async rejectApplication(applicationId, { reason } = {}, reviewerId) {
    const app = await models.Application.findByPk(applicationId);
    if (!app) throw new NotFoundError('Application not found');

    await app.update({
      status: 'rejected',
      decidedAt: new Date(),
      reviewedBy: reviewerId,
      // Shown to the applicant on their status page.
      decisionReason: reason || app.decisionReason
    });
    return app;
  }

  /** Link an application to a freshly registered user (called from register). */
  async linkUserByInvite(inviteId, userId, transaction) {
    const app = await models.Application.findOne({ where: { inviteId }, transaction });
    if (app) {
      app.userId = userId;
      await app.save({ transaction });
    }
  }
}

module.exports = new ApplicationService();
