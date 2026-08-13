const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const cohortIntakeService = require('../services/cohortIntakeService');
const applicationService = require('../services/applicationService');
const assessmentService = require('../services/assessmentService');
const intakeExportService = require('../services/intakeExportService');
const levelRecommendationService = require('../services/levelRecommendationService');
const clanAssignmentService = require('../services/clanAssignmentService');
const { parseCsv } = require('../utils/csv');

// The score-import body may arrive as { csv: "<raw text>" } (preferred — server
// parses it robustly) or { rows: [...] } (already parsed). Normalize to rows.
function parseImportBody(body) {
  if (body && typeof body.csv === 'string') return parseCsv(body.csv).rows;
  if (body && Array.isArray(body.rows)) return body.rows;
  return [];
}
const authzService = require('../services/authzService');

// ─── Cohorts ─────────────────────────────────────────────────────────────────

const listCohorts = catchAsync(async (req, res) => {
  const { programId, status } = req.query;
  // A program_admin sees only their programs' cohorts (org admins: all).
  const programScope = await authzService.adminProgramScope(req.user, {
    assignments: req.loadAssignments ? await req.loadAssignments() : undefined
  });
  const filters = { programId, status };
  if (Array.isArray(programScope) && programScope.length) filters.programIds = programScope;
  const cohorts = await cohortIntakeService.listCohorts(filters);
  res.status(200).json(successResponse('Cohorts retrieved', { cohorts }));
});

const getCohort = catchAsync(async (req, res) => {
  const cohort = await cohortIntakeService.getCohort(req.params.id);
  res.status(200).json(successResponse('Cohort retrieved', { cohort }));
});

const createCohort = catchAsync(async (req, res) => {
  const cohort = await cohortIntakeService.createCohort(req.body, req.user.id);
  res.status(201).json(successResponse('Cohort created', { cohort }, 201));
});

const updateCohort = catchAsync(async (req, res) => {
  const cohort = await cohortIntakeService.updateCohort(req.params.id, req.body);
  res.status(200).json(successResponse('Cohort updated', { cohort }));
});

const enablePublicLink = catchAsync(async (req, res) => {
  const result = await cohortIntakeService.enablePublicLink(req.params.id);
  res.status(200).json(successResponse('Public intake link enabled', { cohort: result.cohort, applyUrl: result.applyUrl }));
});

const disablePublicLink = catchAsync(async (req, res) => {
  const cohort = await cohortIntakeService.disablePublicLink(req.params.id);
  res.status(200).json(successResponse('Public intake link disabled', { cohort }));
});

const cloneIntake = catchAsync(async (req, res) => {
  const cohort = await cohortIntakeService.cloneIntakeFrom(req.params.id, req.body?.sourceCohortId);
  res.status(200).json(successResponse('Intake configuration copied', { cohort }));
});

// Get-or-create the cohort's assessment so "create inline" is idempotent (a
// double-click can't spawn duplicates) and the builder opens immediately.
const ensureCohortAssessment = catchAsync(async (req, res) => {
  const cohort = await cohortIntakeService.getCohort(req.params.id);
  if (cohort.assessmentId) {
    const existing = await assessmentService.getAssessment(cohort.assessmentId);
    return res.status(200).json(successResponse('Assessment ready', { assessment: existing }));
  }
  const assessment = await assessmentService.createAssessment(
    { title: `${cohort.name} - assessment`, programId: cohort.programId },
    req.user.id
  );
  await cohortIntakeService.updateCohort(req.params.id, { assessmentId: assessment.id });
  res.status(201).json(successResponse('Assessment created', { assessment }, 201));
});

// The cohort's assessment pool (level-aware, randomly assigned per applicant).
const getCohortAssessments = catchAsync(async (req, res) => {
  const pool = await assessmentService.getCohortPool(req.params.id);
  res.status(200).json(successResponse('Assessment pool retrieved', { pool }));
});

const setCohortAssessments = catchAsync(async (req, res) => {
  const pool = await assessmentService.setCohortPool(req.params.id, req.body?.items || []);
  res.status(200).json(successResponse('Assessment pool saved', { pool }));
});

// ─── Applications ──────────────────────────────────────────────────────────────

const listApplications = catchAsync(async (req, res) => {
  const { applications, passThreshold } = await applicationService.listApplications(req.params.id, { status: req.query.status });
  res.status(200).json(successResponse('Applications retrieved', { applications, passThreshold }));
});

const getApplication = catchAsync(async (req, res) => {
  const detail = await applicationService.getApplication(req.params.id);
  res.status(200).json(successResponse('Application retrieved', detail));
});

const gradeAssessmentSubmission = catchAsync(async (req, res) => {
  const submission = await assessmentService.gradeSubmission(
    req.params.submissionId,
    { manualScore: req.body?.manualScore, totalScore: req.body?.totalScore },
    req.user.id
  );
  res.status(200).json(successResponse('Submission graded', { submission }));
});

// ─── AI scoring ────────────────────────────────────────────────────────────
// AI-score a batch of applicants (the client pages through selected rows so a
// big cohort never times out in one request). Resilient: one bad row doesn't
// sink the batch.
const aiGradeApplications = catchAsync(async (req, res) => {
  const ids = Array.isArray(req.body?.applicationIds) ? req.body.applicationIds : [];
  // Both default ON: a run that leaves 300 drafts needing 300 manual clicks is
  // not a usable batch action. The admin can still override any single score,
  // and nothing here sends an email or accepts anyone.
  const applyScores = req.body?.applyScores !== false;
  const recommendLevels = req.body?.recommendLevels !== false;

  const results = [];
  for (const id of ids) {
    const row = { applicationId: id, graded: false, applied: false, levelChecked: false };
    try {
      const graded = await assessmentService.aiGradeApplication(id, req.user.id);
      Object.assign(row, graded);
      if (applyScores && graded.graded && graded.submissionId) {
        try {
          await assessmentService.applyAiScores(graded.submissionId, req.user.id);
          row.applied = true;
        } catch (e) { row.applyError = e.message; }
      }
    } catch (e) {
      row.reason = e.message;
    }
    // Level is judged from the same evidence — run it in the same pass so one
    // action gives both a score and a placement.
    if (recommendLevels) {
      try {
        const lvl = await levelRecommendationService.recommendForApplication(id, req.user.id);
        row.levelChecked = !!lvl.recommended;
        row.recommendedLevel = lvl.recommendedLevel || null;
      } catch (e) { row.levelError = e.message; }
    }
    results.push(row);
  }
  res.status(200).json(successResponse('AI review run', { results }));
});

// What an AI run would grade on (questions + rubrics + who's in scope) — shown
// to the admin BEFORE anything runs.
const getScoringPlan = catchAsync(async (req, res) => {
  const ids = Array.isArray(req.body?.applicationIds) ? req.body.applicationIds : [];
  const plan = await assessmentService.getScoringPlan(req.params.id, ids);
  res.status(200).json(successResponse('Scoring plan', plan));
});

// AI-score ONE submission (from the review drawer).
const aiGradeSubmission = catchAsync(async (req, res) => {
  const result = await assessmentService.aiGradeSubmission(req.params.submissionId, req.user.id);
  res.status(200).json(successResponse('AI scoring run', result));
});

// Commit the AI's suggested scores to the real score (explicit admin action).
const applyAiScores = catchAsync(async (req, res) => {
  const submission = await assessmentService.applyAiScores(req.params.submissionId, req.user.id);
  res.status(200).json(successResponse('AI scores applied', { submission }));
});

// ─── Level recommendation ────────────────────────────────────────────────────
const getLevelRules = catchAsync(async (req, res) => {
  const rules = await levelRecommendationService.getRules(req.params.id);
  res.status(200).json(successResponse('Level rules', rules));
});

const setLevelRules = catchAsync(async (req, res) => {
  const rules = await levelRecommendationService.setRules(req.params.id, req.body || {});
  res.status(200).json(successResponse('Level rules saved', rules));
});

// Batch: the client pages through the selection so a big cohort never times out.
const recommendLevels = catchAsync(async (req, res) => {
  const ids = Array.isArray(req.body?.applicationIds) ? req.body.applicationIds : [];
  const results = [];
  for (const id of ids) {
    try {
      results.push(await levelRecommendationService.recommendForApplication(id, req.user.id));
    } catch (e) {
      results.push({ applicationId: id, recommended: false, reason: e.message });
    }
  }
  res.status(200).json(successResponse('Level recommendation run', { results }));
});

const applyLevelRecommendation = catchAsync(async (req, res) => {
  const application = await levelRecommendationService.applyRecommendation(req.params.id);
  res.status(200).json(successResponse('Level applied', { application }));
});

// ─── CSV export / import (score round-trip) ──────────────────────────────────
const exportApplicationsCsv = catchAsync(async (req, res) => {
  const status = req.body?.status || req.query.status;
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : undefined;
  const { filename, csv } = await intakeExportService.exportCsv(req.params.id, { status, ids });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(csv);
});

const previewScoreImport = catchAsync(async (req, res) => {
  const rows = parseImportBody(req.body);
  const preview = await intakeExportService.previewImport(req.params.id, rows);
  res.status(200).json(successResponse('Import preview', preview));
});

const applyScoreImport = catchAsync(async (req, res) => {
  const rows = parseImportBody(req.body);
  const result = await intakeExportService.applyImport(req.params.id, rows, req.user.id);
  res.status(200).json(successResponse('Import applied', result));
});

// Accept + invite a batch of selected applicants (irreversible — emails go out).
const bulkAcceptApplications = catchAsync(async (req, res) => {
  const result = await applicationService.bulkAccept(
    req.params.id,
    Array.isArray(req.body?.applicationIds) ? req.body.applicationIds : [],
    { clanId: req.body?.clanId },
    req.user.id
  );
  res.status(200).json(successResponse('Invites sent', result));
});

const bulkRejectApplications = catchAsync(async (req, res) => {
  const result = await applicationService.bulkReject(
    req.params.id,
    Array.isArray(req.body?.applicationIds) ? req.body.applicationIds : [],
    { reason: req.body?.reason },
    req.user.id
  );
  res.status(200).json(successResponse('Applications rejected', result));
});

const importApplications = catchAsync(async (req, res) => {
  const { rows, allowExceed } = req.body;
  const report = await applicationService.importApplications(req.params.id, rows, req.user.id, { allowExceed: !!allowExceed });
  res.status(200).json(successResponse('Applications imported', { report }));
});

const createApplication = catchAsync(async (req, res) => {
  const application = await applicationService.createApplication(req.params.id, req.body);
  res.status(201).json(successResponse('Application created', { application }, 201));
});

const updateApplication = catchAsync(async (req, res) => {
  const application = await applicationService.updateApplication(req.params.id, req.body, req.user.id);
  res.status(200).json(successResponse('Application updated', { application }));
});

const acceptApplication = catchAsync(async (req, res) => {
  const result = await applicationService.acceptApplication(req.params.id, { clanId: req.body?.clanId }, req.user.id);
  res.status(200).json(successResponse('Application accepted', result));
});

const rejectApplication = catchAsync(async (req, res) => {
  const application = await applicationService.rejectApplication(req.params.id, { reason: req.body?.reason }, req.user.id);
  res.status(200).json(successResponse('Application rejected', { application }));
});

/** POST /cohorts/:id/assign/preview  { applicationIds, settings } — propose clans, no writes. */
const previewClanAssignment = catchAsync(async (req, res) => {
  const { applicationIds, settings } = req.body || {};
  const result = await clanAssignmentService.previewAssignment(req.params.id, applicationIds, settings || {});
  res.status(200).json(successResponse('Assignment preview', result));
});

/** POST /cohorts/:id/assign/commit  { assignments:[{applicationId, clanId}] } — accept + place. */
const commitClanAssignment = catchAsync(async (req, res) => {
  const result = await clanAssignmentService.commitAssignment(req.params.id, req.body?.assignments, req.user.id);
  res.status(200).json(successResponse('Candidates assigned to clans', result));
});

/** POST /cohorts/:id/assign/unassigned/preview  { settings } — propose clans for unplaced mentees. */
const previewUnassignedAssignment = catchAsync(async (req, res) => {
  const result = await clanAssignmentService.previewUnassigned(req.params.id, req.body?.settings || {});
  res.status(200).json(successResponse('Unplaced-mentee assignment preview', result));
});

/** POST /cohorts/:id/assign/unassigned/commit  { placements:[{userId, clanId}] } — place into clans. */
const commitUnassignedAssignment = catchAsync(async (req, res) => {
  const result = await clanAssignmentService.commitPlacement(req.params.id, req.body?.placements, req.user.id);
  res.status(200).json(successResponse('Mentees placed into clans', result));
});

module.exports = {
  listCohorts,
  getCohort,
  createCohort,
  updateCohort,
  enablePublicLink,
  disablePublicLink,
  cloneIntake,
  ensureCohortAssessment,
  getCohortAssessments,
  setCohortAssessments,
  listApplications,
  getApplication,
  gradeAssessmentSubmission,
  importApplications,
  createApplication,
  updateApplication,
  acceptApplication,
  bulkAcceptApplications,
  bulkRejectApplications,
  rejectApplication,
  previewClanAssignment,
  commitClanAssignment,
  previewUnassignedAssignment,
  commitUnassignedAssignment,
  aiGradeApplications,
  getScoringPlan,
  getLevelRules,
  setLevelRules,
  recommendLevels,
  applyLevelRecommendation,
  aiGradeSubmission,
  applyAiScores,
  exportApplicationsCsv,
  previewScoreImport,
  applyScoreImport
};
