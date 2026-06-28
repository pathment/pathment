const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const publicIntakeService = require('../services/publicIntakeService');

// ─── Catalog ─────────────────────────────────────────────────────────────────
const listPrograms = catchAsync(async (req, res) => {
  const programs = await publicIntakeService.listPublicPrograms();
  res.status(200).json(successResponse('Programs retrieved', { programs }));
});

const getProgram = catchAsync(async (req, res) => {
  const program = await publicIntakeService.getPublicProgram(req.params.id);
  res.status(200).json(successResponse('Program retrieved', { program }));
});

// ─── Apply (cohort link) ────────────────────────────────────────────────────
const getCohort = catchAsync(async (req, res) => {
  const info = await publicIntakeService.getCohortApplyInfo(req.params.slug);
  res.status(200).json(successResponse('Application info retrieved', info));
});

const apply = catchAsync(async (req, res) => {
  const result = await publicIntakeService.submitApplication(req.params.slug, req.body);
  res.status(201).json(successResponse('Application submitted', result, 201));
});

// "Already applied? Continue" — re-issue the magic link by email (privacy-safe).
const resume = catchAsync(async (req, res) => {
  const result = await publicIntakeService.resumeByEmail(req.params.slug, req.body?.email);
  res.status(200).json(successResponse('Resume link sent', result));
});

// ─── Status / assessment (magic link) ────────────────────────────────────────
const getStatus = catchAsync(async (req, res) => {
  const status = await publicIntakeService.getApplicationStatus(req.params.token);
  res.status(200).json(successResponse('Application status retrieved', status));
});

const submitAssessment = catchAsync(async (req, res) => {
  const result = await publicIntakeService.submitAssessment(req.params.token, req.body?.answers || {});
  res.status(200).json(successResponse('Assessment submitted', result));
});

// Applicant self-serve: edit submitted info, or withdraw — both before the deadline.
const updateInfo = catchAsync(async (req, res) => {
  const result = await publicIntakeService.updateApplicationInfo(req.params.token, req.body || {});
  res.status(200).json(successResponse('Application updated', result));
});

const withdraw = catchAsync(async (req, res) => {
  const result = await publicIntakeService.withdrawApplication(req.params.token);
  res.status(200).json(successResponse('Application withdrawn', result));
});

const uploadFile = catchAsync(async (req, res) => {
  const result = await publicIntakeService.uploadAssessmentFile(req.params.token, req.file);
  res.status(201).json(successResponse('File uploaded', result, 201));
});

module.exports = {
  listPrograms,
  getProgram,
  getCohort,
  apply,
  resume,
  getStatus,
  submitAssessment,
  updateInfo,
  withdraw,
  uploadFile
};
