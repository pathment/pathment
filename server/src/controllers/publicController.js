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

// ─── Status / assessment (magic link) ────────────────────────────────────────
const getStatus = catchAsync(async (req, res) => {
  const status = await publicIntakeService.getApplicationStatus(req.params.token);
  res.status(200).json(successResponse('Application status retrieved', status));
});

const submitAssessment = catchAsync(async (req, res) => {
  const result = await publicIntakeService.submitAssessment(req.params.token, req.body?.answers || {});
  res.status(200).json(successResponse('Assessment submitted', result));
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
  getStatus,
  submitAssessment,
  uploadFile
};
