const crypto = require('crypto');
const { Op } = require('sequelize');
const { models } = require('../db');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors/errorTypes');
const { generateRandomToken, hashToken } = require('../utils/jwt');
const cohortIntakeService = require('./cohortIntakeService');
const assessmentService = require('./assessmentService');
const emailService = require('./emailService');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ACCESS_TOKEN_TTL_DAYS = 60;

/**
 * The public, unauthenticated intake surface: a program catalog anyone can
 * browse, a self-serve application form behind a cohort link, and a magic-link
 * status/assessment page for not-yet-registered applicants. Nothing here exposes
 * internal org data — only published programs and the applicant's own record.
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

    let assessment = null;
    if (cohort.assessment) {
      assessment = { title: cohort.assessment.title, required: cohort.assessmentRequired };
    }

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
    if (!EMAIL_RE.test(email)) throw new ValidationError('A valid email is required');

    // If they already have a real account, they should log in, not apply.
    const existingUser = await models.User.findOne({ where: { email } });
    if (existingUser) throw new ConflictError('An account already exists for this email — please log in instead');

    const rawToken = generateRandomToken();
    const accessTokenHash = hashToken(rawToken);
    const accessTokenExpiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    const requiresAssessment = Boolean(cohort.assessmentId && cohort.assessmentRequired);
    const initialStatus = requiresAssessment ? 'assessment_sent' : 'pending';

    const fields = {
      firstName: data.firstName || null,
      lastName: data.lastName || null,
      phone: data.phone || null,
      programPreference: data.programPreference || cohort.program?.name || null,
      source: 'public_link',
      responses: data.responses && typeof data.responses === 'object' ? data.responses : {},
      accessTokenHash,
      accessTokenExpiresAt
    };

    let application = await models.Application.findOne({ where: { cohortId: cohort.id, email } });
    if (application) {
      if (['accepted', 'rejected'].includes(application.status)) {
        throw new ConflictError('An application with this email has already been processed');
      }
      await application.update(fields);
    } else {
      application = await models.Application.create({ cohortId: cohort.id, email, status: initialStatus, ...fields });
    }

    const statusUrl = this.buildStatusUrl(rawToken);
    await this._sendApplicationEmail(email, cohort, statusUrl, requiresAssessment).catch(() => {});

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

    let assessment = null;
    let submission = null;
    if (cohort?.assessmentId) {
      const full = await assessmentService.getAssessment(cohort.assessmentId);
      assessment = { ...assessmentService.sanitizeForApplicant(full), required: cohort.assessmentRequired };
      const existing = await models.AssessmentSubmission.findOne({
        where: { assessmentId: cohort.assessmentId, applicationId: application.id }
      });
      if (existing) submission = { status: existing.status, submittedAt: existing.submittedAt };
    }

    return {
      application: {
        id: application.id,
        email: application.email,
        firstName: application.firstName,
        lastName: application.lastName,
        status: application.status,
        assessmentSubmittedAt: application.assessmentSubmittedAt,
        createdAt: application.createdAt
      },
      program: cohort?.program ? { id: cohort.program.id, name: cohort.program.name } : null,
      cohort: cohort ? { id: cohort.id, name: cohort.name } : null,
      assessment,
      submission
    };
  }

  /** Submit assessment answers; auto-grade the answerable items. */
  async submitAssessment(rawToken, answers) {
    const application = await this._findByAccessToken(rawToken);
    const cohort = application.cohort;
    if (!cohort?.assessmentId) throw new ValidationError('No assessment is attached to this application');

    const full = await assessmentService.getAssessment(cohort.assessmentId);
    const questions = full.questions || [];
    const clean = answers && typeof answers === 'object' ? answers : {};

    assessmentService.validateAnswers(questions, clean);
    const { autoScore, maxScore, hasManual } = assessmentService.gradeAuto(questions, clean);

    const now = new Date();
    const existing = await models.AssessmentSubmission.findOne({
      where: { assessmentId: cohort.assessmentId, applicationId: application.id }
    });
    if (existing && existing.status !== 'in_progress') {
      throw new ConflictError('You have already submitted this assessment');
    }

    const payload = {
      assessmentId: cohort.assessmentId,
      applicationId: application.id,
      answers: clean,
      autoScore,
      maxScore,
      // If nothing needs a human, the auto score is final.
      totalScore: hasManual ? null : autoScore,
      status: 'submitted',
      submittedAt: now
    };
    if (existing) await existing.update(payload);
    else await models.AssessmentSubmission.create(payload);

    await application.update({
      assessmentSubmittedAt: now,
      // Move into the review queue; mirror the auto score for triage.
      status: application.status === 'accepted' || application.status === 'rejected' ? application.status : 'under_review',
      assessmentScore: hasManual ? application.assessmentScore : autoScore
    });

    return { autoScore, maxScore, pendingManualGrading: hasManual };
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

  async _sendApplicationEmail(email, cohort, statusUrl, requiresAssessment) {
    const programName = cohort.program?.name || 'the program';
    const action = requiresAssessment
      ? 'Your next step is to complete a short assessment.'
      : "We've received your application and will be in touch.";
    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto">
        <h2 style="color:#0052D6">Application received</h2>
        <p>Thanks for applying to <strong>${programName}</strong> (${cohort.name}).</p>
        <p>${action}</p>
        <p style="margin:24px 0">
          <a href="${statusUrl}" style="background:#0066FF;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">
            ${requiresAssessment ? 'Start assessment / track status' : 'Track your application'}
          </a>
        </p>
        <p style="color:#64748b;font-size:13px">Keep this link private — it's your personal access to this application.</p>
      </div>`;
    return emailService.sendEmail({
      to: email,
      subject: `Application received — ${programName}`,
      html,
      text: `Thanks for applying to ${programName} (${cohort.name}). ${action} Track it here: ${statusUrl}`,
      emailType: 'intake_application'
    });
  }
}

module.exports = new PublicIntakeService();
