const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const cohortIntakeService = require('../services/cohortIntakeService');
const applicationService = require('../services/applicationService');
const assessmentService = require('../services/assessmentService');

// ─── Cohorts ─────────────────────────────────────────────────────────────────

const listCohorts = catchAsync(async (req, res) => {
  const { programId, status } = req.query;
  const cohorts = await cohortIntakeService.listCohorts({ programId, status });
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

// ─── Applications ──────────────────────────────────────────────────────────────

const listApplications = catchAsync(async (req, res) => {
  const applications = await applicationService.listApplications(req.params.id, { status: req.query.status });
  res.status(200).json(successResponse('Applications retrieved', { applications }));
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

const importApplications = catchAsync(async (req, res) => {
  const { rows } = req.body;
  const report = await applicationService.importApplications(req.params.id, rows, req.user.id);
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

module.exports = {
  listCohorts,
  getCohort,
  createCohort,
  updateCohort,
  enablePublicLink,
  disablePublicLink,
  listApplications,
  getApplication,
  gradeAssessmentSubmission,
  importApplications,
  createApplication,
  updateApplication,
  acceptApplication,
  rejectApplication
};
