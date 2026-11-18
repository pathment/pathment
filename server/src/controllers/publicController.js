const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const publicIntakeService = require('../services/publicIntakeService');
const certificateService = require('../services/certificateService');

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
// ── Taking the assessment (by private link) ──────────────────────────────────
const startAssessment = catchAsync(async (req, res) => {
  const result = await publicIntakeService.startAssessment(req.params.token, { capabilities: req.body?.capabilities });
  res.status(200).json(successResponse('Assessment started', result));
});

const saveAssessmentDraft = catchAsync(async (req, res) => {
  const result = await publicIntakeService.saveAssessmentDraft(req.params.token, req.body?.answers || {});
  res.status(200).json(successResponse('Saved', result));
});

const logAssessmentProctor = catchAsync(async (req, res) => {
  const result = await publicIntakeService.logAssessmentProctor(req.params.token, req.body?.events || []);
  res.status(200).json(successResponse('Logged', result));
});

const uploadAssessmentSnapshot = catchAsync(async (req, res) => {
  const result = await publicIntakeService.uploadAssessmentSnapshot(req.params.token, req.file, {
    questionId: req.body?.questionId || null, source: req.body?.source || 'camera',
  });
  res.status(200).json(successResponse('Snapshot saved', result));
});

const signAssessmentVideo = catchAsync(async (req, res) => {
  const result = await publicIntakeService.signAssessmentVideo(req.params.token, req.body?.questionId);
  res.status(200).json(successResponse('Upload ready', result));
});

const attachAssessmentVideo = catchAsync(async (req, res) => {
  const result = await publicIntakeService.attachAssessmentVideo(req.params.token, req.body?.questionId, {
    file: req.file || null, publicId: req.body?.publicId || null,
  });
  res.status(200).json(successResponse('Video saved', result));
});

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


/**
 * GET /api/public/verify/:number  — resolve a certificate number.
 *
 * Always 200: "this code is not a credential we issued" is a legitimate answer
 * to a legitimate question, not an error. A 404 here would also let a caller
 * distinguish "malformed" from "well-formed but unknown", which is a small
 * oracle worth not handing out.
 */
const verifyCertificate = catchAsync(async (req, res) => {
  const result = await certificateService.verifyByNumber(req.params.number);
  res.status(200).json(successResponse(
    result.valid ? 'Certificate verified' : 'No certificate found for that number',
    result
  ));
});

module.exports = {
  listPrograms,
  getProgram,
  getCohort,
  apply,
  resume,
  getStatus,
  submitAssessment,
  startAssessment,
  saveAssessmentDraft,
  logAssessmentProctor,
  uploadAssessmentSnapshot,
  signAssessmentVideo,
  attachAssessmentVideo,
  updateInfo,
  withdraw,
  uploadFile,
  verifyCertificate
};
