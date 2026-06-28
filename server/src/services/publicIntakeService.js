const crypto = require('crypto');
const { Op } = require('sequelize');
const { models } = require('../db');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors/errorTypes');
const { generateRandomToken, hashToken } = require('../utils/jwt');
const cohortIntakeService = require('./cohortIntakeService');
const assessmentService = require('./assessmentService');
const emailService = require('./emailService');
const { validateIntakeValue } = require('../config/intakeProfileFields');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ACCESS_TOKEN_TTL_DAYS = 60;

/**
 * The public, unauthenticated intake surface: a program catalog anyone can
 * browse, a self-serve application form behind a cohort link, and a magic-link
 * status/assessment page for not-yet-registered applicants. Nothing here exposes
 * internal org data - only published programs and the applicant's own record.
 */
class PublicIntakeService {
  // ── Catalog ────────────────────────────────────────────────────────────────
  async listPublicPrograms() {
    const programs = await models.Program.findAll({
      where: { status: 'published', visibility: 'public' },
      attributes: ['id', 'name', 'description', 'type', 'tags', 'totalDurationWeeks', 'estimatedHoursPerWeek', 'targetAudience'],
      order: [['name', 'ASC']]
    });

    // Which programs are currently accepting applications (open public cohort)?
    const ids = programs.map((p) => p.id);
    const openCohorts = ids.length
      ? await models.Cohort.findAll({
          where: { programId: { [Op.in]: ids }, publicEnabled: true, status: 'open' },
          attributes: ['id', 'programId', 'publicSlug']
        })
      : [];
    const acceptingByProgram = new Set(openCohorts.map((c) => c.programId));

    return programs.map((p) => ({ ...p.toJSON(), acceptingApplications: acceptingByProgram.has(p.id) }));
  }

  async getPublicProgram(programId) {
    const program = await models.Program.findOne({
      where: { id: programId, status: 'published', visibility: 'public' },
      attributes: ['id', 'name', 'description', 'type', 'tags', 'learningOutcomes', 'prerequisites', 'totalDurationWeeks', 'estimatedHoursPerWeek', 'targetAudience']
    });
    if (!program) throw new NotFoundError('Program not found');

    const cohorts = await models.Cohort.findAll({
      where: { programId, publicEnabled: true, status: 'open' },
      attributes: ['id', 'name', 'publicSlug', 'startDate', 'endDate', 'applyClosesAt']
    });

    return {
      ...program.toJSON(),
      openCohorts: cohorts
        .map((c) => {
          const json = c.toJSON();
          return { id: json.id, name: json.name, slug: json.publicSlug, startDate: json.startDate, endDate: json.endDate, applyClosesAt: json.applyClosesAt };
        })
        // Defensive: only surface cohorts whose window is actually live.
        .filter((c) => c.slug)
    };
  }

  // ── Apply ────────────────────────────────────────────────────────────────────
  /** Public info for the apply form behind a cohort link. */
  async getCohortApplyInfo(slug) {
    const resolved = await cohortIntakeService.getOpenCohortBySlug(slug);
    if (!resolved) throw new NotFoundError('This application link is not valid');
    const { cohort, open, reasons } = resolved;

    // Which exact assessment an applicant gets depends on their level + a random
    // draw, so the form only advertises THAT an assessment is involved, not which.
    const poolCount = await models.CohortAssessment.count({ where: { cohortId: cohort.id } });
    const hasAssessment = poolCount > 0 || !!cohort.assessmentId;
    const assessment = hasAssessment ? { required: !!cohort.assessmentRequired } : null;

    return {
      open,
      reasons,
      cohort: {
        id: cohort.id,
        name: cohort.name,
        description: cohort.description,
        slug: cohort.publicSlug,
        startDate: cohort.startDate,
        endDate: cohort.endDate,
        applyClosesAt: cohort.applyClosesAt
      },
      program: cohort.program ? { id: cohort.program.id, name: cohort.program.name, description: cohort.program.description, type: cohort.program.type } : null,
      formSchema: cohort.intakeFormSchema || [],
      // Applicant-selectable levels (empty = no level question).
      levels: Array.isArray(cohort.levels) ? cohort.levels : [],
      assessment
    };
  }

  /**
   * Submit a public application. Idempotent-ish: re-applying with the same email
   * to a still-pending application re-issues the magic link (resume), but a
   * decided application is locked. Returns the raw access token + status URL.
   */
  async submitApplication(slug, data) {
    const resolved = await cohortIntakeService.getOpenCohortBySlug(slug);
    if (!resolved) throw new NotFoundError('This application link is not valid');
    if (!resolved.open) throw new ValidationError('This cohort is not accepting applications right now');

    const cohort = resolved.cohort;
    const email = String(data.email || '').trim().toLowerCase();
    if (!String(data.firstName || '').trim() || !String(data.lastName || '').trim()) {
      throw new ValidationError('Your first and last name are required');
    }
    if (!EMAIL_RE.test(email)) throw new ValidationError('A valid email is required');
    // Phone is free-form text (never a number — it can have +, spaces, leading 0s),
    // but it must look like a phone when given.
    const phoneErr = data.phone ? validateIntakeValue({ key: 'phone', type: 'phone' }, data.phone) : null;
    if (phoneErr) throw new ValidationError(`Phone: ${phoneErr}`);

    // Enforce required intake fields server-side (the client checks too, but a
    // direct API call must not be able to skip them).
    const schema = Array.isArray(cohort.intakeFormSchema) ? cohort.intakeFormSchema : [];
    const responses = data.responses && typeof data.responses === 'object' ? data.responses : {};
    for (const field of schema) {
      if (!field) continue;
      const top = { firstName: data.firstName, lastName: data.lastName, phone: data.phone };
      const raw = responses[field.key] ?? top[field.key];
      const answered = Array.isArray(raw) ? raw.length > 0 : String(raw ?? '').trim().length > 0;
      if (field.required && !answered) throw new ValidationError(`Please complete: ${field.label || field.key}`);
      // Type-aware format check (URL/email/phone/number/date) — applies whether or
      // not the field is required, so a bad value can't slip through optional fields.
      const formatError = validateIntakeValue(field, Array.isArray(raw) ? raw.join(', ') : raw);
      if (formatError) throw new ValidationError(`${field.label || field.key}: ${formatError}`);
    }

    // If they already have a real account, they should log in, not apply.
    const existingUser = await models.User.findOne({ where: { email } });
    if (existingUser) throw new ConflictError('An account already exists for this email - please log in instead');

    // Level: required only when the cohort defines levels, and must be one of them.
    const levels = Array.isArray(cohort.levels) ? cohort.levels : [];
    let level = data.level != null ? String(data.level).trim() : null;
    if (levels.length) {
      if (!level) throw new ValidationError('Please select your level');
      if (!levels.some((l) => l.key === level)) throw new ValidationError('Please select a valid level');
    } else {
      level = null;
    }

    const rawToken = generateRandomToken();
    const accessTokenHash = hashToken(rawToken);
    const accessTokenExpiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    const fields = {
      firstName: data.firstName || null,
      lastName: data.lastName || null,
      phone: data.phone || null,
      level,
      programPreference: data.programPreference || cohort.program?.name || null,
      source: 'public_link',
      responses: data.responses && typeof data.responses === 'object' ? data.responses : {},
      accessTokenHash,
      accessTokenExpiresAt
    };

    let application = await models.Application.findOne({ where: { cohortId: cohort.id, email } });
    const isNew = !application;
    if (application) {
      if (['accepted', 'rejected'].includes(application.status)) {
        throw new ConflictError('An application with this email has already been processed');
      }
      // Changing level invalidates a previously-assigned assessment (re-pick).
      if (level !== (application.level || null)) fields.assignedAssessmentId = null;
      await application.update(fields);
    } else {
      application = await models.Application.create({ cohortId: cohort.id, email, status: 'pending', ...fields });
    }

    // Assign this applicant's assessment (level-aware, random from the pool) and
    // gate the status on it only when the cohort marks the assessment required.
    const assignedAssessmentId = await assessmentService.ensureAssignedAssessment(application, cohort);
    const requiresAssessment = Boolean(assignedAssessmentId && cohort.assessmentRequired);
    if (requiresAssessment && application.status === 'pending') {
      await application.update({ status: 'assessment_sent' });
    }

    const statusUrl = this.buildStatusUrl(rawToken);
    await this._sendApplicationEmail(email, cohort, statusUrl, requiresAssessment, !!assignedAssessmentId).catch(() => {});

    // Admin alerts: a new applicant landed, and (separately) the cohort may have
    // just hit its application cap — both best-effort, never block the applicant.
    if (isNew) {
      cohortIntakeService.notifyApplicationReceived(cohort, application).catch(() => {});
      if (cohort.maxApplications != null) {
        const count = await models.Application.count({ where: { cohortId: cohort.id } });
        if (count >= cohort.maxApplications) cohortIntakeService.notifyCapacityReached(cohort, count).catch(() => {});
      }
    }

    return {
      accessToken: rawToken,
      statusUrl,
      requiresAssessment,
      application: { id: application.id, status: application.status, email }
    };
  }

  // ── Status / assessment (magic link) ──────────────────────────────────────────
  async _findByAccessToken(rawToken) {
    if (!rawToken) throw new ValidationError('Missing access token');
    const accessTokenHash = hashToken(rawToken);
    const application = await models.Application.findOne({
      where: { accessTokenHash },
      include: [{ model: models.Cohort, as: 'cohort', include: [{ model: models.Program, as: 'program', attributes: ['id', 'name'] }] }]
    });
    if (!application) throw new NotFoundError('This link is not valid');
    if (application.accessTokenExpiresAt && new Date() > new Date(application.accessTokenExpiresAt)) {
      throw new ValidationError('This link has expired');
    }
    return application;
  }

  /** The applicant's own status, plus the (sanitized) assessment if attached. */
  async getApplicationStatus(rawToken) {
    const application = await this._findByAccessToken(rawToken);
    const cohort = application.cohort;

    const deadline = cohort?.applyClosesAt || null;
    const decided = ['accepted', 'rejected'].includes(application.status);
    const pastDeadline = !!(deadline && new Date() > new Date(deadline));

    // The applicant's OWN assigned assessment (level-aware, randomly drawn at
    // apply time and stored, so it's stable across visits). Assign lazily if an
    // older application predates assignment.
    let assessment = null;
    let submission = null;
    const assignedId = cohort ? await assessmentService.ensureAssignedAssessment(application, cohort) : application.assignedAssessmentId;
    if (assignedId) {
      const full = await assessmentService.getAssessment(assignedId);
      assessment = { ...assessmentService.sanitizeForApplicant(full), required: cohort?.assessmentRequired };
      const existing = await models.AssessmentSubmission.findOne({
        where: { assessmentId: assignedId, applicationId: application.id }
      });
      if (existing) {
        submission = {
          status: existing.status,
          submittedAt: existing.submittedAt,
          updatedAt: existing.updatedAt,
          submissionCount: existing.submissionCount || 1,
          // The applicant's own answers, so the form can pre-fill for editing.
          answers: existing.answers || {}
        };
      }
    }

    const withdrawn = application.status === 'withdrawn';
    // Whether they can still take/revise the assessment, edit their info, or withdraw.
    const canEditAssessment = !!assignedId && !decided && !withdrawn && !pastDeadline && (!submission || submission.status !== 'graded');
    const canEditInfo = !decided && !withdrawn && !pastDeadline;
    const canWithdraw = !decided && !withdrawn;
    // Level can only be changed while it's safe (no assessment submitted yet) —
    // otherwise switching level would re-roll the assessment and discard their work.
    const canChangeLevel = canEditInfo && !(submission && submission.status !== 'in_progress');

    return {
      application: {
        id: application.id,
        email: application.email,
        firstName: application.firstName,
        lastName: application.lastName,
        phone: application.phone,
        level: application.level,
        status: application.status,
        // Everything they filled in, so the status page can show "your information".
        responses: application.responses || {},
        assessmentSubmittedAt: application.assessmentSubmittedAt,
        createdAt: application.createdAt
      },
      program: cohort?.program ? { id: cohort.program.id, name: cohort.program.name } : null,
      cohort: cohort ? { id: cohort.id, name: cohort.name } : null,
      // The level labels so a stored level key can render as its friendly label.
      levels: Array.isArray(cohort?.levels) ? cohort.levels : [],
      // The intake form fields, so the portal can render an editable copy.
      formSchema: Array.isArray(cohort?.intakeFormSchema) ? cohort.intakeFormSchema : [],
      assessment,
      submission,
      deadline,
      canEditAssessment,
      canEditInfo,
      canChangeLevel,
      canWithdraw
    };
  }

  /**
   * Update an applicant's submitted info before the deadline. Name/phone/answers
   * are freely editable; LEVEL is special — changing it re-rolls the assessment,
   * so it's only allowed while no assessment has been submitted (we clear the
   * in-progress one and re-assign). Locked once decided, withdrawn, or past close.
   */
  async updateApplicationInfo(rawToken, data) {
    const application = await this._findByAccessToken(rawToken);
    const cohort = application.cohort;

    if (['accepted', 'rejected'].includes(application.status)) throw new ConflictError('Your application has already been decided and can no longer be edited.');
    if (application.status === 'withdrawn') throw new ConflictError('This application has been withdrawn.');
    if (cohort?.applyClosesAt && new Date() > new Date(cohort.applyClosesAt)) throw new ValidationError('The deadline to edit your application has passed.');

    if (!String(data.firstName || '').trim() || !String(data.lastName || '').trim()) {
      throw new ValidationError('Your first and last name are required');
    }
    const phoneErr = data.phone ? validateIntakeValue({ key: 'phone', type: 'phone' }, data.phone) : null;
    if (phoneErr) throw new ValidationError(`Phone: ${phoneErr}`);

    // Validate intake fields (required + format) — same rules as applying.
    const schema = Array.isArray(cohort.intakeFormSchema) ? cohort.intakeFormSchema : [];
    const responses = data.responses && typeof data.responses === 'object' ? data.responses : {};
    for (const field of schema) {
      if (!field) continue;
      const top = { firstName: data.firstName, lastName: data.lastName, phone: data.phone };
      const raw = responses[field.key] ?? top[field.key];
      const answered = Array.isArray(raw) ? raw.length > 0 : String(raw ?? '').trim().length > 0;
      if (field.required && !answered) throw new ValidationError(`Please complete: ${field.label || field.key}`);
      const formatError = validateIntakeValue(field, Array.isArray(raw) ? raw.join(', ') : raw);
      if (formatError) throw new ValidationError(`${field.label || field.key}: ${formatError}`);
    }

    // Level handling.
    const levels = Array.isArray(cohort.levels) ? cohort.levels : [];
    let level = data.level != null ? String(data.level).trim() : (application.level || null);
    if (levels.length) {
      if (!level) throw new ValidationError('Please select your level');
      if (!levels.some((l) => l.key === level)) throw new ValidationError('Please select a valid level');
    } else {
      level = null;
    }
    const levelChanged = level !== (application.level || null);
    if (levelChanged) {
      const sub = await models.AssessmentSubmission.findOne({ where: { applicationId: application.id } });
      if (sub && sub.status !== 'in_progress') {
        throw new ValidationError('You can’t change your level after submitting the assessment.');
      }
      if (sub) await sub.destroy();          // discard the untouched/in-progress one
      await application.update({ assignedAssessmentId: null, assessmentSubmittedAt: null });
    }

    await application.update({
      firstName: data.firstName || null,
      lastName: data.lastName || null,
      phone: data.phone || null,
      level,
      responses
    });

    // Re-assign the assessment for the new level and re-gate the status.
    if (levelChanged) {
      const assignedId = await assessmentService.ensureAssignedAssessment(application, cohort);
      const requiresAssessment = Boolean(assignedId && cohort.assessmentRequired);
      await application.update({ status: requiresAssessment ? 'assessment_sent' : 'pending' });
    }

    return { ok: true };
  }

  /** Withdraw an application (self-serve). Allowed any time before a decision. */
  async withdrawApplication(rawToken) {
    const application = await this._findByAccessToken(rawToken);
    if (['accepted', 'rejected'].includes(application.status)) {
      throw new ConflictError('Your application has already been decided and can no longer be withdrawn.');
    }
    if (application.status !== 'withdrawn') await application.update({ status: 'withdrawn' });
    return { ok: true };
  }

  /** Submit assessment answers; auto-grade the answerable items. */
  /**
   * Submit OR update assessment answers. An applicant may revise as many times as
   * they like UNTIL the deadline (the cohort's apply-closes date) — the stored row
   * is always their latest answers, so the admin reviews the final version. Locked
   * once decided, graded, or past the deadline.
   */
  async submitAssessment(rawToken, answers) {
    const application = await this._findByAccessToken(rawToken);
    const cohort = application.cohort;

    if (['accepted', 'rejected'].includes(application.status)) {
      throw new ConflictError('Your application has already been decided — the assessment can no longer be changed.');
    }
    if (cohort?.applyClosesAt && new Date() > new Date(cohort.applyClosesAt)) {
      throw new ValidationError('The deadline to submit or update this assessment has passed.');
    }

    const assignedId = await assessmentService.ensureAssignedAssessment(application, cohort);
    if (!assignedId) throw new ValidationError('No assessment is attached to this application');

    const full = await assessmentService.getAssessment(assignedId);
    const questions = full.questions || [];
    const clean = answers && typeof answers === 'object' ? answers : {};

    assessmentService.validateAnswers(questions, clean);
    const { autoScore, maxScore, hasManual } = assessmentService.gradeAuto(questions, clean);

    const now = new Date();
    const existing = await models.AssessmentSubmission.findOne({
      where: { assessmentId: assignedId, applicationId: application.id }
    });
    // Once an admin has graded it, the applicant can't overwrite their work.
    if (existing && existing.status === 'graded') {
      throw new ConflictError('This assessment has already been graded and can no longer be changed.');
    }

    const submissionCount = existing ? (existing.submissionCount || 0) + 1 : 1;
    const payload = {
      assessmentId: assignedId,
      applicationId: application.id,
      answers: clean,
      autoScore,
      maxScore,
      // If nothing needs a human, the auto score is final.
      totalScore: hasManual ? null : autoScore,
      status: 'submitted',
      submittedAt: now,
      submissionCount
    };
    if (existing) await existing.update(payload);
    else await models.AssessmentSubmission.create(payload);

    await application.update({
      assessmentSubmittedAt: now,
      // Move into the review queue; mirror the auto score for triage.
      status: application.status === 'accepted' || application.status === 'rejected' ? application.status : 'under_review',
      assessmentScore: hasManual ? application.assessmentScore : autoScore
    });

    return { autoScore, maxScore, pendingManualGrading: hasManual, submissionCount };
  }

  /** Upload a file for a file_upload answer (gated by the applicant's token). */
  async uploadAssessmentFile(rawToken, file) {
    await this._findByAccessToken(rawToken);
    if (!file || !file.buffer) throw new ValidationError('No file provided');
    const result = await uploadToCloudinary(file.buffer, 'pathment/assessments', 'auto');
    return { url: result.url, fileName: file.originalname, fileSizeBytes: file.size };
  }

  // ── helpers ──────────────────────────────────────────────────────────────────
  buildStatusUrl(rawToken) {
    const base = (process.env.CLIENT_URL || 'http://localhost:3000').split(',')[0].replace(/\/$/, '');
    return `${base}/apply/status/${encodeURIComponent(rawToken)}`;
  }

  async _sendApplicationEmail(email, cohort, statusUrl, requiresAssessment, hasAssessment = false) {
    const programName = cohort.program?.name || 'the program';
    const action = requiresAssessment
      ? 'Your next step is to complete a short assessment — your application moves to review once it&apos;s in.'
      : hasAssessment
        ? 'You can complete an optional assessment to strengthen your application, or just track its status.'
        : "We've received your application and will be in touch.";
    const cta = requiresAssessment ? 'Start assessment / track status' : hasAssessment ? 'Take assessment / track status' : 'Track your application';
    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto">
        <h2 style="color:#0052D6">Application received</h2>
        <p>Thanks for applying to <strong>${programName}</strong> (${cohort.name}).</p>
        <p>${action}</p>
        <p style="margin:24px 0">
          <a href="${statusUrl}" style="background:#0066FF;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">${cta}</a>
        </p>
        <p style="color:#64748b;font-size:13px">Keep this link private - it's your personal access to this application. Return any time to finish where you left off.</p>
      </div>`;
    return emailService.sendEmail({
      to: email,
      subject: `Application received - ${programName}`,
      html,
      text: `Thanks for applying to ${programName} (${cohort.name}). ${action.replace(/&apos;/g, "'")} Open it here: ${statusUrl}`,
      emailType: 'intake_application'
    });
  }

  /**
   * "Already applied? Continue" — re-issue a fresh magic link to a returning
   * applicant by email, so they never lose their progress (profile / assessment).
   * Privacy-safe: the response is identical whether or not an application exists,
   * and we only ever email the link to the address on file (no data leaked inline).
   */
  async resumeByEmail(slug, rawEmail) {
    const email = String(rawEmail || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new ValidationError('A valid email is required');

    const generic = { ok: true, message: 'If an application exists for that email, we\'ve sent a link to continue.' };
    const resolved = await cohortIntakeService.getOpenCohortBySlug(slug);
    // Resume must work even when the window/cap closed — they already applied.
    const cohort = resolved?.cohort || await models.Cohort.findOne({
      where: { publicSlug: slug },
      include: [{ model: models.Program, as: 'program', attributes: ['id', 'name'] }]
    });
    if (!cohort) return generic;

    const application = await models.Application.findOne({ where: { cohortId: cohort.id, email } });
    if (!application || ['accepted', 'rejected'].includes(application.status)) return generic;

    const rawToken = generateRandomToken();
    await application.update({
      accessTokenHash: hashToken(rawToken),
      accessTokenExpiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)
    });
    const requiresAssessment = Boolean(application.assignedAssessmentId && cohort.assessmentRequired);
    await this._sendApplicationEmail(email, cohort, this.buildStatusUrl(rawToken), requiresAssessment, !!application.assignedAssessmentId).catch(() => {});
    return generic;
  }
}

module.exports = new PublicIntakeService();
