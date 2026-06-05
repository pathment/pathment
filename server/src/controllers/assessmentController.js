const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const assessmentService = require('../services/assessmentService');

const listAssessments = catchAsync(async (req, res) => {
  const assessments = await assessmentService.listAssessments({ programId: req.query.programId, status: req.query.status });
  res.status(200).json(successResponse('Assessments retrieved', { assessments }));
});

const getAssessment = catchAsync(async (req, res) => {
  const assessment = await assessmentService.getAssessment(req.params.id);
  res.status(200).json(successResponse('Assessment retrieved', { assessment }));
});

const createAssessment = catchAsync(async (req, res) => {
  const assessment = await assessmentService.createAssessment(req.body, req.user.id);
  res.status(201).json(successResponse('Assessment created', { assessment }, 201));
});

const updateAssessment = catchAsync(async (req, res) => {
  const assessment = await assessmentService.updateAssessment(req.params.id, req.body);
  res.status(200).json(successResponse('Assessment updated', { assessment }));
});

const setQuestions = catchAsync(async (req, res) => {
  const assessment = await assessmentService.setQuestions(req.params.id, req.body?.questions || []);
  res.status(200).json(successResponse('Questions saved', { assessment }));
});

const deleteAssessment = catchAsync(async (req, res) => {
  const result = await assessmentService.deleteAssessment(req.params.id);
  res.status(200).json(successResponse('Assessment deleted', result));
});

module.exports = {
  listAssessments,
  getAssessment,
  createAssessment,
  updateAssessment,
  setQuestions,
  deleteAssessment
};
