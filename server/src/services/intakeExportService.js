const { models } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');
const { toCsv } = require('../utils/csv');
const assessmentService = require('./assessmentService');

/**
 * CSV export + import for an intake cohort's applications. Export produces one
 * Excel-friendly sheet (identity → editable score/decision → read-only answers &
 * AI context). Import reads back ONLY the editable columns, matched on a stable
 * application_id, and is preview-first so nothing is written blind.
 *
 * The three EDITABLE columns (everything else is read-only context):
 *   total_score      the final assessment score (mirrors to the submission too)
 *   status           pending | assessment_sent | under_review | accepted |
 *                    rejected | waitlisted | withdrawn
 *   reviewer_notes   internal notes
 */
const EDITABLE = ['total_score', 'status', 'reviewer_notes'];
const STATUSES = ['pending', 'assessment_sent', 'under_review', 'accepted', 'rejected', 'waitlisted', 'withdrawn'];

const num = (v) => (v == null || v === '' ? null : Number(v));
const shortPrompt = (p) => String(p || 'Question').replace(/\s+/g, ' ').trim().slice(0, 60);

/** Render one applicant's answer to one question as readable text. */
function renderAnswer(q, answers) {
  const a = (answers || {})[q.id] || {};
  switch (q.type) {
    case 'mcq':
    case 'multi_select': {
      const byId = new Map((q.options || []).map((o) => [o.id, o.label]));
      return (a.optionIds || []).map((id) => byId.get(id) || id).join('; ');
    }
    case 'file_upload': return a.fileUrl ? `${a.fileName || 'file'}: ${a.fileUrl}` : '';
    case 'external_link': return a.link || '';
    default: return a.text || '';
  }
}

class IntakeExportService {
  /** Cohort + its applications (filtered) + submissions + the questions in play. */
  async _load(cohortId, { status, ids } = {}) {
    const cohort = await models.Cohort.findByPk(cohortId);
    if (!cohort) throw new NotFoundError('Cohort not found');

    const where = { cohortId };
    if (status && status !== 'all') where.status = status;
    // An explicit id list wins — it's exactly the filtered rows on screen, so
    // the sheet always matches what the admin is looking at.
    if (Array.isArray(ids) && ids.length) where.id = ids;
    const applications = await models.Application.findAll({ where, order: [['createdAt', 'DESC']] });

    const submissions = await models.AssessmentSubmission.findAll({ where: { applicationId: applications.map((a) => a.id) } });
    const subByApp = new Map();
    for (const s of submissions) {
      const prev = subByApp.get(s.applicationId);
      if (!prev || new Date(s.submittedAt || 0) > new Date(prev.submittedAt || 0)) subByApp.set(s.applicationId, s);
    }

    // Distinct assessments actually assigned across this set (pool-aware), ordered.
    const assessmentIds = [...new Set(applications.map((a) => a.assignedAssessmentId || cohort.assessmentId).filter(Boolean).map(String))];
    const assessments = assessmentIds.length
      ? await models.Assessment.findAll({ where: { id: assessmentIds }, include: [{ model: models.AssessmentQuestion, as: 'questions' }] })
      : [];
    // One flat, stable question list (dedup by id, ordered by assessment then position).
    const seen = new Set();
    const questions = [];
    for (const asmt of assessments) {
      for (const q of [...(asmt.questions || [])].sort((x, y) => x.position - y.position)) {
        if (seen.has(q.id)) continue;
        seen.add(q.id);
        questions.push(q);
      }
    }
    return { cohort, applications, subByApp, questions };
  }

  async exportCsv(cohortId, { status, ids } = {}) {
    const { cohort, applications, subByApp, questions } = await this._load(cohortId, { status, ids });
    const threshold = num(cohort.passThreshold);

    // Union of intake response keys, so every applicant's answers get a column.
    const intakeKeys = [];
    const seenKeys = new Set();
    for (const app of applications) {
      for (const k of Object.keys(app.responses || {})) {
        if (!seenKeys.has(k)) { seenKeys.add(k); intakeKeys.push(k); }
      }
    }

    // Columns: identity → EDITABLE → derived → AI → answers → intake.
    const columns = [
      { key: 'application_id', header: 'application_id' }, // stable match key — do not edit
      { key: 'first_name', header: 'first_name' },
      { key: 'last_name', header: 'last_name' },
      { key: 'email', header: 'email' },
      { key: 'phone', header: 'phone' },
      { key: 'level', header: 'level' },
      { key: 'program_preference', header: 'program_preference' },
      { key: 'total_score', header: 'total_score' },       // EDITABLE
      { key: 'status', header: 'status' },                 // EDITABLE
      { key: 'reviewer_notes', header: 'reviewer_notes' }, // EDITABLE
      { key: 'pass', header: 'pass' },
      { key: 'auto_score', header: 'auto_score' },
      { key: 'max_score', header: 'max_score' },
      { key: 'ai_overall', header: 'ai_overall' },
      { key: 'ai_summary', header: 'ai_summary' },
      { key: 'submitted_at', header: 'submitted_at' },
    ];
    questions.forEach((q, i) => {
      columns.push({ key: `ans_${q.id}`, header: `Q${i + 1}: ${shortPrompt(q.prompt)}` });
      columns.push({ key: `aipts_${q.id}`, header: `Q${i + 1} · AI pts` });
    });
    intakeKeys.forEach((k) => columns.push({ key: `intake_${k}`, header: `intake: ${k}` }));

    const rows = applications.map((app) => {
      const sub = subByApp.get(app.id);
      const total = sub ? num(sub.totalScore) : num(app.assessmentScore);
      const max = sub ? num(sub.maxScore) : null;
      const pass = (threshold != null && total != null && max)
        ? ((total / max) * 100 >= threshold ? 'pass' : 'fail') : '';
      const aiDraft = sub && sub.aiDraft ? sub.aiDraft : null;
      const row = {
        application_id: app.id,
        first_name: app.firstName || '',
        last_name: app.lastName || '',
        email: app.email,
        phone: app.phone || '',
        level: app.level || '',
        program_preference: app.programPreference || '',
        total_score: total != null ? total : '',
        status: app.status,
        reviewer_notes: app.reviewerNotes || '',
        pass,
        auto_score: sub && sub.autoScore != null ? Number(sub.autoScore) : '',
        max_score: max != null ? max : '',
        ai_overall: aiDraft && aiDraft.overall != null ? aiDraft.overall : '',
        ai_summary: aiDraft && aiDraft.summary ? aiDraft.summary : '',
        submitted_at: sub && sub.submittedAt ? new Date(sub.submittedAt).toISOString() : '',
      };
      for (const q of questions) {
        row[`ans_${q.id}`] = sub ? renderAnswer(q, sub.answers) : '';
        const per = aiDraft && aiDraft.perQuestion && aiDraft.perQuestion[q.id];
        row[`aipts_${q.id}`] = per && per.suggestedPoints != null ? per.suggestedPoints : '';
      }
      for (const k of intakeKeys) {
        const v = (app.responses || {})[k];
        row[`intake_${k}`] = v == null ? '' : (typeof v === 'string' ? v : JSON.stringify(v));
      }
      return row;
    });

    const stamp = new Date().toISOString().slice(0, 10);
    const safe = String(cohort.name || 'cohort').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    return { filename: `applications-${safe}-${stamp}.csv`, csv: toCsv(columns, rows) };
  }

  /** Validate + diff a parsed sheet against the DB — NO writes. */
  async previewImport(cohortId, parsedRows) {
    const cohort = await models.Cohort.findByPk(cohortId);
    if (!cohort) throw new NotFoundError('Cohort not found');
    if (!Array.isArray(parsedRows)) throw new ValidationError('No rows to import');

    const apps = await models.Application.findAll({ where: { cohortId }, attributes: ['id', 'firstName', 'lastName', 'email', 'status', 'assessmentScore', 'reviewerNotes'] });
    const byId = new Map(apps.map((a) => [String(a.id), a]));

    const changes = [];
    const errors = [];
    let unchanged = 0;

    parsedRows.forEach((raw, idx) => {
      const line = idx + 2; // +1 header, +1 to 1-index
      const id = String(raw.application_id || '').trim();
      if (!id) { errors.push({ line, reason: 'missing application_id' }); return; }
      const app = byId.get(id);
      if (!app) { errors.push({ line, reason: `no application ${id} in this cohort` }); return; }

      const after = {};
      const before = {};
      // total_score
      if ('total_score' in raw && String(raw.total_score).trim() !== '') {
        const v = Number(raw.total_score);
        if (!Number.isFinite(v) || v < 0) { errors.push({ line, reason: `invalid total_score "${raw.total_score}"` }); return; }
        if (num(app.assessmentScore) !== v) { before.total_score = num(app.assessmentScore); after.total_score = v; }
      }
      // status
      if ('status' in raw && String(raw.status).trim() !== '') {
        const st = String(raw.status).trim();
        if (!STATUSES.includes(st)) { errors.push({ line, reason: `invalid status "${st}"` }); return; }
        if (app.status !== st) { before.status = app.status; after.status = st; }
      }
      // reviewer_notes
      if ('reviewer_notes' in raw) {
        const notes = String(raw.reviewer_notes || '');
        if ((app.reviewerNotes || '') !== notes) { before.reviewer_notes = app.reviewerNotes || ''; after.reviewer_notes = notes; }
      }

      if (Object.keys(after).length === 0) { unchanged += 1; return; }
      changes.push({ applicationId: id, name: `${app.firstName || ''} ${app.lastName || ''}`.trim() || app.email, email: app.email, before, after });
    });

    return { summary: { totalRows: parsedRows.length, willUpdate: changes.length, unchanged, errors: errors.length }, changes, errors };
  }

  /** Apply the validated edits. Re-validates from scratch (never trusts a stale
   *  preview) and writes each change; the score also mirrors onto the submission. */
  async applyImport(cohortId, parsedRows, actorId) {
    const preview = await this.previewImport(cohortId, parsedRows);
    let updated = 0;
    const failed = [];

    for (const change of preview.changes) {
      try {
        const patch = {};
        if ('total_score' in change.after) patch.assessmentScore = change.after.total_score;
        if ('status' in change.after) patch.status = change.after.status;
        if ('reviewer_notes' in change.after) patch.reviewerNotes = change.after.reviewer_notes;
        patch.reviewedBy = actorId;
        await models.Application.update(patch, { where: { id: change.applicationId } });

        // Keep the submission's totalScore in lock-step with the application score.
        if ('total_score' in change.after) {
          const sub = await models.AssessmentSubmission.findOne({ where: { applicationId: change.applicationId }, order: [['submittedAt', 'DESC']] });
          if (sub) await assessmentService.gradeSubmission(sub.id, { totalScore: change.after.total_score }, actorId);
        }
        updated += 1;
      } catch (e) {
        failed.push({ applicationId: change.applicationId, reason: e.message });
      }
    }

    return { updated, skipped: preview.summary.unchanged, errors: [...preview.errors, ...failed] };
  }
}

module.exports = new IntakeExportService();
module.exports.EDITABLE = EDITABLE;
module.exports.STATUSES = STATUSES;
