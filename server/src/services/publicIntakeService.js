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
// A timed attempt's answers still land this long after the clock runs out (the
// browser auto-submits at zero; this absorbs a slow network).
const TIMED_GRACE_MS = 90 * 1000;
const proctoring = require('../proctoring/rules');
const media = require('../proctoring/media');

/** Proctored or strictly timed: one sitting, no revising after submit. */
const oneShot = (assessment) => Boolean(assessment?.proctored || (assessment?.enforceTimeLimit && assessment?.timeLimitMins));
/** When a timed attempt ends, or null when it isn't timed or hasn't started. */
const attemptDeadline = (assessment, submission) => (
  assessment?.enforceTimeLimit && assessment?.timeLimitMins && submission?.startedAt
    ? new Date(new Date(submission.startedAt).getTime() + assessment.timeLimitMins * 60 * 1000)
    : null
);

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
      assessment,
      // The page puts this in its URL, so the rest of the visit (status page,
      // assessment) stays in the cohort's workspace without a login.
      workspace: require('../utils/links').tenantSlug()
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

    /*
     * Someone who already has a Pathment account may apply like anyone else.
     * The form is public and an applicant has no way of knowing which address
     * we already hold, so turning them away at the end — after they filled the
     * whole thing in — lost the application and the person. Their account is
     * reconciled when the application is ACCEPTED (applicationService), where
     * the workspace is known: the lookup here is unauthenticated, so a match
     * may be an account in a completely different workspace and proves nothing.
     */

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
      // Their own pick, kept apart from `level`, which the automatic review
      // overwrites with the level it decides on.
      selfSelectedLevel: level,
      // Nobody has judged this yet; it is the applicant's own word.
      levelSource: 'self',
      programPreference: data.programPreference || cohort.program?.name || null,
      source: 'public_link',
      responses: data.responses && typeof data.responses === 'object' ? data.responses : {},
      accessTokenHash,
      accessTokenExpiresAt
    };

    let application = await models.Application.findOne({ where: { cohortId: cohort.id, email } });
    const isNew = !application;
    if (application) {
      if (['accepted', 'rejected', 'removed'].includes(application.status)) {
        throw new ConflictError('An application with this email has already been processed');
      }
      // Changing level invalidates a previously-assigned assessment (re-pick).
      if (level !== (application.level || null)) fields.assignedAssessmentId = null;
      await application.update(fields);
    } else {
      application = await models.Application.create({ cohortId: cohort.id, email, status: 'pending', ...fields });
    }

    /*
     * Which paper they sit depends on their LEVEL, and on an intake that
     * reviews, the level they claimed is not yet the level they are. Papering
     * them on the claim and reviewing afterwards is how a self-declared
     * beginner came to sit the beginner paper and then be moved to senior —
     * judged on a paper written for somebody else. So when a review is going
     * to decide, the paper waits for it (seconds, by email); when there is
     * nothing to decide, it goes out now exactly as it always did.
     */
    const decidedByReview = await this._levelDecidesTheAssessment(cohort);
    const assignedAssessmentId = decidedByReview
      ? null
      : await assessmentService.ensureAssignedAssessment(application, cohort);
    // 'on_invite': the assessment comes later, by email, when an admin sends it.
    const onInvite = cohort.assessmentMode === 'on_invite';
    const requiresAssessment = Boolean(assignedAssessmentId && cohort.assessmentRequired && !onInvite);
    if (requiresAssessment && application.status === 'pending') {
      await application.update({ status: 'assessment_sent' });
    }

    const statusUrl = this.buildStatusUrl(rawToken);
    await this._sendApplicationEmail(email, cohort, statusUrl, requiresAssessment, !!assignedAssessmentId && !onInvite).catch(() => {});

    // Hands-off pipeline, after the response is settled: straight into any
    // selection pool that takes this intake, and — when there is no assessment
    // to wait for — Pathment AI sets their level now (else on assessment submit).
    const automation = require('./poolAutomationService');
    // One ordered pipeline: review, then the attached pools at the reviewed
    // level, then the paper for that level. Not awaited — the applicant's
    // response does not wait on the AI.
    automation.safely('process new application', () => this.afterApply(application.id, {
      review: decidedByReview || !assignedAssessmentId,
    }));

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
    // "Opened": the first time they follow their link (a pipeline step).
    if (!application.linkOpenedAt || (application.assessmentInvitedAt && new Date(application.linkOpenedAt) < new Date(application.assessmentInvitedAt))) {
      await application.update({ linkOpenedAt: new Date() });
    }
    // An "invite first" intake keeps the assessment back until it's sent.
    const awaitingInvite = cohort?.assessmentMode === 'on_invite' && !application.assessmentInvitedAt;

    const now = new Date();
    // Editing info closes with the apply window; the assessment can have its OWN
    // (later/earlier) deadline, falling back to the apply-closes date.
    const infoDeadline = cohort?.applyClosesAt || null;
    const assessmentDeadline = cohort?.assessmentDeadline || cohort?.applyClosesAt || null;
    // Removed by an admin counts as settled: nothing more can be changed.
    const decided = ['accepted', 'rejected', 'removed'].includes(application.status);
    const pastInfoDeadline = !!(infoDeadline && now > new Date(infoDeadline));
    const pastAssessmentDeadline = !!(assessmentDeadline && now > new Date(assessmentDeadline));

    // The applicant's OWN assigned assessment (level-aware, randomly drawn at
    // apply time and stored, so it's stable across visits). Assign lazily if an
    // older application predates assignment.
    let assessment = null;
    let submission = null;
    let full = null;
    const assignedId = awaitingInvite ? null
      : cohort ? await assessmentService.ensureAssignedAssessment(application, cohort) : application.assignedAssessmentId;
    if (assignedId) {
      full = await assessmentService.getAssessment(assignedId);
      assessment = { ...assessmentService.sanitizeForApplicant(full), required: cohort?.assessmentRequired };
      let existing = await models.AssessmentSubmission.findOne({
        where: { assessmentId: assignedId, applicationId: application.id }
      });
      // A timed attempt whose clock ran out is finished with what was saved.
      if (existing) existing = await this._finalizeIfExpired(existing, full, application);
      if (existing) {
        const deadlineAt = attemptDeadline(full, existing);
        submission = {
          status: existing.status,
          submittedAt: existing.submittedAt,
          updatedAt: existing.updatedAt,
          submissionCount: existing.submissionCount || 1,
          startedAt: existing.startedAt || null,
          deadlineAt,
          // The applicant's own answers, so the form can pre-fill for editing.
          answers: existing.answers || {}
        };
      }
    }

    const withdrawn = application.status === 'withdrawn';
    // Whether they can still take/revise the assessment, edit their info, or withdraw.
    const canEditAssessment = !!assignedId && !decided && !withdrawn && !pastAssessmentDeadline && (!submission || submission.status !== 'graded')
      // Proctored or strictly timed: one sitting, no revising after submit.
      && !(oneShot(full) && submission && submission.status !== 'in_progress');
    const canEditInfo = !decided && !withdrawn && !pastInfoDeadline;
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
        // The reason shown on a decision (e.g. why they were rejected).
        decisionReason: application.decisionReason || null,
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
      // Invite-first intake, not invited yet: "we'll email you".
      awaitingInvite,
      serverNow: new Date().toISOString(),
      deadline: infoDeadline,
      assessmentDeadline,
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

    if (['accepted', 'rejected', 'removed'].includes(application.status)) throw new ConflictError('Your application has already been decided and can no longer be edited.');
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
      ...(levelChanged ? { selfSelectedLevel: level } : {}),
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
    if (['accepted', 'rejected', 'removed'].includes(application.status)) {
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

    if (['accepted', 'rejected', 'removed'].includes(application.status)) {
      throw new ConflictError('Your application has already been decided — the assessment can no longer be changed.');
    }
    const assessmentDeadline = cohort?.assessmentDeadline || cohort?.applyClosesAt;
    if (assessmentDeadline && new Date() > new Date(assessmentDeadline)) {
      throw new ValidationError('The deadline to submit or update this assessment has passed.');
    }

    const assignedId = await assessmentService.ensureAssignedAssessment(application, cohort);
    if (!assignedId) throw new ValidationError('No assessment is attached to this application');

    if (cohort?.assessmentMode === 'on_invite' && !application.assessmentInvitedAt) {
      throw new ConflictError("Your assessment hasn't been sent yet — we'll email you when it is.");
    }

    const full = await assessmentService.getAssessment(assignedId);
    const questions = full.questions || [];

    const now = new Date();
    let existing = await models.AssessmentSubmission.findOne({
      where: { assessmentId: assignedId, applicationId: application.id }
    });
    // Once an admin has graded it, the applicant can't overwrite their work.
    if (existing && existing.status === 'graded') {
      throw new ConflictError('This assessment has already been graded and can no longer be changed.');
    }
    if (oneShot(full)) {
      if (!existing || !existing.startedAt) throw new ValidationError('Start the assessment first.');
      if (existing.status !== 'in_progress') throw new ConflictError('You have already submitted this assessment.');
      existing = await this._finalizeIfExpired(existing, full, application);
      if (existing.status !== 'in_progress') throw new ConflictError('Time is up — your saved answers were submitted.');
    }
    // Videos are whatever the server stored, never what the browser claims.
    const clean = this._withServerVideos(questions, answers && typeof answers === 'object' ? answers : {}, existing?.answers);
    // The clock ran out: what they had is submitted even if it's incomplete.
    const timedOut = Boolean(attemptDeadline(full, existing) && now > attemptDeadline(full, existing));
    if (!timedOut) assessmentService.validateAnswers(questions, clean);
    const { autoScore, maxScore, hasManual } = assessmentService.gradeAuto(questions, clean);

    const submissionCount = existing && existing.status !== 'in_progress' ? (existing.submissionCount || 0) + 1 : 1;
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

    // The assessment is the evidence the AI level is decided on.
    const automation = require('./poolAutomationService');
    automation.safely('process assessed application', () => automation.processApplication(application.id, { review: true }));

    return { autoScore, maxScore, pendingManualGrading: hasManual, submissionCount };
  }

  /**
   * The applicant's assessment attempt, checked for being open: not decided or
   * withdrawn, invited when the intake needs that, before the intake deadline.
   * `submission` is their attempt row (created by `start`), or null.
   */
  async _attempt(rawToken, { forRecording = false } = {}) {
    const application = await this._findByAccessToken(rawToken);
    const cohort = application.cohort;
    if (['accepted', 'rejected', 'removed', 'withdrawn'].includes(application.status)) {
      throw new ConflictError('Your application has already been decided — the assessment can no longer be changed.');
    }
    if (cohort?.assessmentMode === 'on_invite' && !application.assessmentInvitedAt) {
      throw new ConflictError("Your assessment hasn't been sent yet — we'll email you when it is.");
    }
    const assessmentDeadline = cohort?.assessmentDeadline || cohort?.applyClosesAt;
    if (!forRecording && assessmentDeadline && new Date() > new Date(assessmentDeadline)) {
      throw new ValidationError('The deadline to submit or update this assessment has passed.');
    }
    const assignedId = await assessmentService.ensureAssignedAssessment(application, cohort);
    if (!assignedId) throw new ValidationError('No assessment is attached to this application');
    const assessment = await assessmentService.getAssessment(assignedId);
    const submission = await models.AssessmentSubmission.findOne({ where: { assessmentId: assignedId, applicationId: application.id } });
    return { application, cohort, assessment, submission };
  }

  /** A timed attempt past its deadline (and grace) is submitted as it stands. */
  async _finalizeIfExpired(submission, assessment, application) {
    const deadlineAt = attemptDeadline(assessment, submission);
    if (submission.status !== 'in_progress' || !deadlineAt || Date.now() <= deadlineAt.getTime() + TIMED_GRACE_MS) return submission;
    const { autoScore, maxScore, hasManual } = assessmentService.gradeAuto(assessment.questions || [], submission.answers || {});
    await submission.update({
      status: 'submitted', submittedAt: deadlineAt, autoScore, maxScore, totalScore: hasManual ? null : autoScore,
      submissionCount: Math.max(1, submission.submissionCount || 1),
    });
    await media.appendProctorEvents('assessment_submissions', submission.id, [{ type: 'time_expired', at: new Date().toISOString(), meta: {} }]);
    await application.update({
      assessmentSubmittedAt: deadlineAt,
      status: ['accepted', 'rejected'].includes(application.status) ? application.status : 'under_review',
      assessmentScore: hasManual ? application.assessmentScore : autoScore,
    });
    return submission.reload();
  }

  /**
   * Begin the assessment: the attempt row exists from here, the clock (if it's
   * timed) starts now and survives a refresh, and a client that can't run a
   * proctored / video assessment is turned away before anything starts.
   */
  async startAssessment(rawToken, { capabilities } = {}) {
    const { application, assessment, submission } = await this._attempt(rawToken);
    const requirements = proctoring.requirementsFor({ proctored: assessment.proctored, questions: (assessment.questions || []).map((q) => ({ kind: q.type })) });
    const missing = proctoring.missingCapability(requirements, proctoring.parseCapabilities(capabilities));
    if (missing) throw new ConflictError(proctoring.unsupportedClientMessage(missing, 'assessment'));
    if (submission && submission.status !== 'in_progress' && oneShot(assessment)) {
      throw new ConflictError('You have already submitted this assessment.');
    }
    let row = submission;
    if (!row) {
      row = await models.AssessmentSubmission.create({
        assessmentId: assessment.id, applicationId: application.id, answers: {}, status: 'in_progress', startedAt: new Date(),
      });
    } else if (!row.startedAt) {
      await row.update({ startedAt: new Date() });
    }
    if (!application.assessmentStartedAt) await application.update({ assessmentStartedAt: row.startedAt || new Date() });
    row = await this._finalizeIfExpired(row, assessment, application);
    return { status: row.status, startedAt: row.startedAt, deadlineAt: attemptDeadline(assessment, row), serverNow: new Date().toISOString() };
  }

  /** Answers the server holds that the browser must not overwrite: stored videos. */
  _withServerVideos(questions, incoming, stored) {
    const out = { ...(incoming || {}) };
    for (const q of questions) {
      if (q.type !== 'video' && q.type !== 'audio') continue;
      const keep = stored?.[q.id] || {};
      out[q.id] = { ...(out[q.id] || {}), videoUrl: keep.videoUrl || null, publicId: keep.publicId || null };
      if (!keep.videoUrl) { delete out[q.id].videoUrl; delete out[q.id].publicId; }
    }
    return out;
  }

  /** Autosave while answering, so a refresh (or a dropped connection) loses nothing. */
  async saveAssessmentDraft(rawToken, answers) {
    const { application, assessment, submission } = await this._attempt(rawToken);
    if (!submission || submission.status !== 'in_progress') {
      if (submission && oneShot(assessment)) throw new ConflictError('You have already submitted this assessment.');
      // Not started (an untimed, unproctored assessment) — nothing to save into yet.
      if (!submission) return { saved: false };
      return { saved: false };
    }
    const done = await this._finalizeIfExpired(submission, assessment, application);
    if (done.status !== 'in_progress') throw new ConflictError('Time is up — your saved answers were submitted.');
    const clean = answers && typeof answers === 'object' && !Array.isArray(answers) ? answers : {};
    await submission.update({ answers: this._withServerVideos(assessment.questions || [], clean, submission.answers) });
    return { saved: true };
  }

  /** Proctor events from the applicant's browser (focus loss, fullscreen exit…). */
  async logAssessmentProctor(rawToken, events) {
    const { submission } = await this._attempt(rawToken, { forRecording: true });
    if (!submission || submission.status !== 'in_progress') return { logged: 0 };
    const clean = media.cleanClientEvents(events);
    await media.appendProctorEvents('assessment_submissions', submission.id, clean);
    return { logged: clean.length };
  }

  async uploadAssessmentSnapshot(rawToken, file, { questionId = null, source = 'camera' } = {}) {
    const { submission } = await this._attempt(rawToken, { forRecording: true });
    if (!submission || submission.status !== 'in_progress') throw new ConflictError('This assessment is not in progress.');
    return media.storeSnapshot('assessment_submissions', submission.id, file, { questionId, source, folder: 'pathment/assessments/snapshots' });
  }

  /** The submission a video answer may land on: in progress, or submitted a moment ago. */
  async _videoTarget(rawToken, questionId) {
    const { application, assessment, submission } = await this._attempt(rawToken, { forRecording: true });
    if (!submission) throw new ConflictError('Start the assessment first.');
    if (submission.status === 'graded') throw new ConflictError('This assessment has already been reviewed.');
    if (submission.status !== 'in_progress' && !media.recordingStillAccepted(
      { status: 'submitted', submittedAt: submission.submittedAt }, application.status,
    )) throw new ConflictError('This assessment has already been submitted.');
    const question = (assessment.questions || []).find((q) => q.id === questionId);
    if (!question || (question.type !== 'video' && question.type !== 'audio')) throw new ValidationError('A recording can only be attached to a video or audio question');
    return { submission, question };
  }

  async signAssessmentVideo(rawToken, questionId) {
    const { submission, question } = await this._videoTarget(rawToken, questionId);
    return media.signDirectVideo(`${proctoring.videoPublicIdPrefix('assessments', submission.id, question.id)}${Math.floor(Date.now() / 1000)}`);
  }

  async attachAssessmentVideo(rawToken, questionId, { file = null, publicId = null } = {}) {
    const { submission, question } = await this._videoTarget(rawToken, questionId);
    const { url, publicId: storedId } = await media.resolveVideo({
      file, publicId,
      prefix: proctoring.videoPublicIdPrefix('assessments', submission.id, question.id),
      folder: `pathment/assessments/videos/${submission.id}`,
    });
    const answers = { ...(submission.answers || {}) };
    const replaced = answers[question.id]?.publicId && answers[question.id].publicId !== storedId ? answers[question.id].publicId : null;
    answers[question.id] = { ...(answers[question.id] || {}), videoUrl: url, publicId: storedId };
    await submission.update({ answers });
    media.removeRecording(replaced);
    return { videoUrl: url, questionId: question.id };
  }

  /** Upload a file for a file_upload answer (gated by the applicant's token). */
  async uploadAssessmentFile(rawToken, file) {
    await this._findByAccessToken(rawToken);
    if (!file || !file.buffer) throw new ValidationError('No file provided');
    const result = await uploadToCloudinary(file.buffer, 'pathment/assessments', 'auto');
    const url = result.secure_url || result.url;
    if (!url) throw new ValidationError('Could not upload the file');
    return { url, fileName: file.originalname || 'upload', fileSizeBytes: file.size || 0 };
  }

  /**
   * Is an automatic review going to decide this applicant's level?
   *
   * Only worth holding the paper back when all three are true: the intake has
   * levels, it has criteria to judge them by with the review switched on, and
   * its papers actually differ by level. Any one missing and there is nothing
   * to wait for, so the paper goes out on the applicant's own pick — which is
   * what every intake without level rules has always done.
   */
  async _levelDecidesTheAssessment(cohort) {
    const levels = Array.isArray(cohort.levels) ? cohort.levels : [];
    if (!levels.length) return false;
    const rules = await require('./levelRecommendationService').getRules(cohort.id).catch(() => null);
    if (!rules || rules.autoReview === false) return false;
    if (!(rules.levels || []).some((r) => (r.criteria || []).length)) return false;
    return (await models.CohortAssessment.count({
      where: { cohortId: cohort.id, level: { [Op.ne]: null } },
    })) > 0;
  }

  /**
   * Everything that happens after an application lands, in order:
   *   1. the review decides their level (and the pools attached to the intake
   *      take them at THAT level),
   *   2. the paper for that level is assigned and sent.
   *
   * Separate from `submitApplication` because the applicant's response must not
   * wait on the model, and because the order is the whole point: step 2 reads
   * what step 1 decided. Safe to run again — step 2 is idempotent.
   */
  async afterApply(applicationId, { review = true } = {}) {
    const automation = require('./poolAutomationService');
    // Never lets a failed review swallow the paper: processApplication wraps
    // each of its own steps, so a model outage leaves the applicant at the
    // level they picked and step 2 still papers them.
    await automation.processApplication(applicationId, { review });
    return this.issueAssessment(applicationId);
  }

  /**
   * Assign the paper for the level this applicant now holds, and send it.
   *
   * Idempotent: an applicant who already has one keeps it, so re-running the
   * chain never issues a second paper or a second email.
   */
  async issueAssessment(applicationId) {
    const application = await models.Application.findByPk(applicationId, {
      include: [{ model: models.Cohort, as: 'cohort', include: [{ model: models.Program, as: 'program', attributes: ['id', 'name'] }] }],
    });
    if (!application || !application.cohort) return null;
    if (['withdrawn', 'removed', 'rejected'].includes(application.status)) return null;
    if (application.assignedAssessmentId) return application.assignedAssessmentId;

    const cohort = application.cohort;
    const assessmentId = await assessmentService.ensureAssignedAssessment(application, cohort);
    if (!assessmentId) return null;
    // 'on_invite' means an admin chooses the moment; the paper is theirs, but
    // it is not sent from here.
    if (cohort.assessmentMode === 'on_invite') return assessmentId;

    /*
     * Claim the send before sending it. The chain can be entered more than once
     * — a re-application, a retry — and two runs that both read "not sent yet"
     * would both send. One conditional UPDATE can win, so exactly one caller
     * mails the paper. Recording the send before making it is the house rule:
     * a failed write costs one missing email, not a repeating one.
     */
    const [claimed] = await models.Application.update(
      { assessmentInvitedAt: new Date() },
      { where: { id: application.id, assessmentInvitedAt: null } },
    );
    if (claimed !== 1) return assessmentId;

    try {
      await require('./assessmentPipelineService').sendInvites(cohort.id, [application.id], null);
    } catch (e) {
      console.error('[intake] could not send the decided assessment (non-fatal):', e.message);
    }
    return assessmentId;
  }

  // ── helpers ──────────────────────────────────────────────────────────────────
  buildStatusUrl(rawToken) {
    const base = require('../utils/applicationUrl')();
    const workspace = require('../utils/links').tenantSlug();
    return `${base}/w/${workspace}/apply/status/${encodeURIComponent(rawToken)}`;
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
    if (!application || ['accepted', 'rejected', 'removed'].includes(application.status)) return generic;

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
