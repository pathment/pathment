const { Op } = require('sequelize');
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

    const applications = await models.Application.findAll({
      where,
      include: [
        { model: models.User, as: 'reviewer', attributes: ['id', 'firstName', 'lastName'] },
        { model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Attach each applicant's max score + AI overall (for the table's grade /
    // pass-fail column) in ONE batched query — no per-row N+1.
    const ids = applications.map((a) => a.id);
    if (ids.length) {
      const subs = await models.AssessmentSubmission.findAll({
        where: { applicationId: ids },
        attributes: ['applicationId', 'maxScore', 'submittedAt', 'aiDraft'],
      });
      const byApp = new Map();
      for (const s of subs) {
        const prev = byApp.get(s.applicationId);
        if (!prev || new Date(s.submittedAt || 0) > new Date(prev.submittedAt || 0)) byApp.set(s.applicationId, s);
      }
      applications.forEach((a) => {
        const s = byApp.get(a.id);
        a.setDataValue('maxScore', s && s.maxScore != null ? Number(s.maxScore) : null);
        a.setDataValue('aiOverall', s && s.aiDraft && s.aiDraft.overall != null ? s.aiDraft.overall : null);
      });
    }
    // The cohort's pass threshold rides along so the client can render pass/fail.
    return { applications, passThreshold: cohort.passThreshold != null ? Number(cohort.passThreshold) : null };
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
  /**
   * Accept an application → issue (or reuse) a mentee invite carrying the clan.
   *
   * Idempotent and duplicate-safe, because it runs at intake scale where a
   * batch can be retried, double-submitted, or resumed after a token expiry:
   *   - already accepted with a live invite → return it (retarget its clan if a
   *     clan is now given), never a throw;
   *   - an active invite already exists for this email → REUSE it and point it
   *     at this clan/cohort, rather than minting a second (the orphaned-duplicate
   *     bug);
   *   - otherwise issue a fresh invite.
   * Net: re-running an assignment is a clean no-op, and "invited without a clan,
   * then assigned" now actually lands the clan on the existing invite.
   */
  async acceptApplication(applicationId, { clanId, resend = false } = {}, acceptedBy) {
    const app = await models.Application.findByPk(applicationId, {
      include: [{ model: models.Cohort, as: 'cohort' }]
    });
    if (!app) throw new NotFoundError('Application not found');

    const cohort = app.cohort;
    if (!cohort) throw new ValidationError('Application is not attached to a cohort');
    const normalizedEmail = (app.email || '').trim().toLowerCase();

    const isLive = (inv) => inv && !inv.usedAt && !inv.revokedAt && new Date(inv.expiresAt) > new Date();

    // Re-sending is a token ROTATION (we only store the hash, so the original
    // link can't be re-mailed). resendRegistrationInvite revokes the old invite
    // and issues + emails a fresh one carrying the same placement.
    const resendWithClan = async (existing) => {
      if (clanId && existing.clanId !== clanId) await existing.update({ clanId });
      const fresh = await adminService.resendRegistrationInvite(existing.id, acceptedBy, {});
      return fresh;
    };

    // 1. Already accepted with a live invite — idempotent. Retarget the clan if
    //    one is supplied and differs (lets you re-assign before they register).
    if (app.status === 'accepted' && app.inviteId) {
      const existing = await models.RegistrationInvite.findByPk(app.inviteId);
      if (isLive(existing)) {
        if (resend) {
          const fresh = await resendWithClan(existing);
          await app.update({ inviteId: fresh.id });
          return { application: app, invite: fresh, resent: true };
        }
        if (clanId && existing.clanId !== clanId) await existing.update({ clanId });
        return { application: app, invite: existing, reused: true };
      }
    }

    // 2. Reuse any active invite already issued for this email (a prior send, or
    //    a concurrent accept that won the race) — retarget it to this placement.
    const existingActive = await models.RegistrationInvite.findOne({
      where: { email: normalizedEmail, role: 'mentee', usedAt: null, revokedAt: null, expiresAt: { [Op.gt]: new Date() } },
      order: [['createdAt', 'DESC']],
    });
    let invite;
    if (existingActive && resend) {
      // The admin explicitly asked to re-send — rotate the token so a real,
      // working link reaches them. Reusing silently is what left people
      // "accepted" with no email they could act on.
      invite = await resendWithClan(existingActive);
    } else if (existingActive) {
      await existingActive.update({
        clanId: clanId || existingActive.clanId,
        programId: cohort.programId,
        cohortId: cohort.id,
      });
      invite = existingActive;
    } else {
      // 3. Fresh invite. If a concurrent accept created one between our check and
      //    here, createRegistrationInvite throws ConflictError — fall back to the
      //    now-existing active invite instead of surfacing a duplicate error.
      try {
        invite = await adminService.createRegistrationInvite({
          email: app.email, role: 'mentee', programId: cohort.programId,
          clanId: clanId || undefined, cohortId: cohort.id,
        }, acceptedBy);
      } catch (e) {
        if (e instanceof ConflictError) {
          const raced = await models.RegistrationInvite.findOne({
            where: { email: normalizedEmail, role: 'mentee', usedAt: null, revokedAt: null, expiresAt: { [Op.gt]: new Date() } },
            order: [['createdAt', 'DESC']],
          });
          if (isLive(raced)) {
            if (clanId && raced.clanId !== clanId) await raced.update({ clanId });
            invite = raced;
          } else { throw e; }
        } else { throw e; }
      }
    }

    await app.update({
      status: 'accepted',
      decidedAt: new Date(),
      reviewedBy: acceptedBy,
      inviteId: invite.id,
    });

    return { application: app, invite };
  }

  /**
   * Accept + invite MANY applicants at once (the "send invites to the selected"
   * action). Idempotent and resilient: each applicant is accepted via the same
   * single path (issues a mentee invite + emails the magic link + marks accepted),
   * and anyone already accepted / already registered / already invited / withdrawn
   * is SKIPPED with a reason rather than failing the batch. Emails only go to the
   * applicants that are newly invited here.
   */
  async bulkAccept(cohortId, applicationIds, { clanId } = {}, acceptedBy) {
    const cohort = await models.Cohort.findByPk(cohortId);
    if (!cohort) throw new NotFoundError('Cohort not found');
    const ids = [...new Set((applicationIds || []).filter(Boolean))];
    if (!ids.length) return { invited: [], skipped: [], total: 0 };

    // Only applicants that actually belong to this cohort (defensive scoping).
    const apps = await models.Application.findAll({
      where: { id: ids, cohortId }, attributes: ['id', 'email', 'firstName', 'lastName', 'status'],
    });
    const found = new Set(apps.map((a) => a.id));

    const invited = [];
    const skipped = [];
    for (const id of ids) {
      if (!found.has(id)) { skipped.push({ id, reason: 'not in this cohort' }); continue; }
      const app = apps.find((a) => a.id === id);
      if (app.status === 'accepted') { skipped.push({ id, email: app.email, reason: 'already accepted' }); continue; }
      if (app.status === 'withdrawn') { skipped.push({ id, email: app.email, reason: 'withdrawn' }); continue; }
      try {
        const { invite } = await this.acceptApplication(id, { clanId }, acceptedBy);
        invited.push({ id, email: app.email, inviteId: invite.id });
      } catch (e) {
        // createRegistrationInvite throws ConflictError when the person already
        // has an account or a live invite — a skip, not a failure.
        const reason = /already/i.test(e.message) ? e.message : e.message || 'could not invite';
        skipped.push({ id, email: app.email, reason });
      }
    }
    return { invited, skipped, total: ids.length };
  }

  /**
   * Reject MANY applicants at once with one shared reason (e.g. everyone who
   * never submitted the required assessment). Each goes through rejectApplication
   * so it gets the decision email + reason. Already-decided/withdrawn are skipped.
   */
  async bulkReject(cohortId, applicationIds, { reason } = {}, reviewerId) {
    const cohort = await models.Cohort.findByPk(cohortId);
    if (!cohort) throw new NotFoundError('Cohort not found');
    const ids = [...new Set((applicationIds || []).filter(Boolean))];
    if (!ids.length) return { rejected: [], skipped: [], total: 0 };

    const apps = await models.Application.findAll({
      where: { id: ids, cohortId }, attributes: ['id', 'email', 'status'],
    });
    const found = new Set(apps.map((a) => a.id));

    const rejected = [];
    const skipped = [];
    for (const id of ids) {
      if (!found.has(id)) { skipped.push({ id, reason: 'not in this cohort' }); continue; }
      const app = apps.find((a) => a.id === id);
      if (app.status === 'rejected') { skipped.push({ id, email: app.email, reason: 'already rejected' }); continue; }
      if (app.status === 'accepted') { skipped.push({ id, email: app.email, reason: 'already accepted' }); continue; }
      if (app.status === 'withdrawn') { skipped.push({ id, email: app.email, reason: 'withdrawn' }); continue; }
      try {
        await this.rejectApplication(id, { reason }, reviewerId); // sets rejected + emails the reason
        rejected.push({ id, email: app.email });
      } catch (e) {
        skipped.push({ id, email: app.email, reason: e.message || 'could not reject' });
      }
    }
    return { rejected, skipped, total: ids.length };
  }

  async rejectApplication(applicationId, { reason } = {}, reviewerId) {
    const app = await models.Application.findByPk(applicationId);
    if (!app) throw new NotFoundError('Application not found');

    const wasDecided = app.status === 'rejected';
    const finalReason = reason || app.decisionReason;
    await app.update({
      status: 'rejected',
      decidedAt: new Date(),
      reviewedBy: reviewerId,
      // Shown to the applicant on their status page.
      decisionReason: finalReason
    });

    // Email the applicant the decision (+ reason). Only on the FIRST rejection —
    // editing the reason later shouldn't re-email. Best-effort; never fail the action.
    if (!wasDecided) {
      try {
        const cohort = await models.Cohort.findByPk(app.cohortId, {
          include: [{ model: models.Program, as: 'program', attributes: ['name'] }],
        });
        await require('./notificationOrchestrator').sendApplicationRejectedEmail({
          email: app.email,
          firstName: app.firstName,
          reason: finalReason,
          programName: cohort?.program?.name || null,
          applicationId: app.id,
        });
      } catch (e) { console.error('[intake] rejection email failed (non-fatal):', e.message); }
    }
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
