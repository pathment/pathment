const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');
const svc = require('../services/feedbackReportService');

const resourceTypeFor = (mime = '') => (mime.startsWith('video/') ? 'video' : mime.startsWith('image/') ? 'image' : 'raw');
const attachmentTypeFor = (mime = '') => (mime.startsWith('video/') ? 'video' : mime.startsWith('image/') ? 'image' : 'file');

/** POST /api/feedback  (multipart: optional `attachment`) — any authenticated user. */
const create = catchAsync(async (req, res) => {
  let attachment = {};
  if (req.file) {
    const result = await uploadToCloudinary(req.file.buffer, 'pathment/feedback', resourceTypeFor(req.file.mimetype));
    attachment = {
      attachmentUrl: result.secure_url || result.url,
      attachmentType: attachmentTypeFor(req.file.mimetype),
      attachmentName: req.file.originalname,
    };
  }
  const report = await svc.create(req.user, { ...req.body, ...attachment });
  res.status(201).json(successResponse('Feedback submitted', { report }, 201));
});

/** GET /api/feedback/mine — the reporter's own reports. */
const listMine = catchAsync(async (req, res) => {
  const reports = await svc.listMine(req.user.id);
  res.status(200).json(successResponse('My feedback', { reports }));
});

/** GET /api/feedback?status=&type=&page=&limit= — admin triage list. */
const listAll = catchAsync(async (req, res) => {
  const data = await svc.listAll(req.query || {});
  res.status(200).json(successResponse('Feedback reports', data));
});

/** PATCH /api/feedback/:id { status?, resolutionNote?, priority? } — admin. */
const updateStatus = catchAsync(async (req, res) => {
  const report = await svc.updateStatus(req.user, req.params.id, req.body || {});
  res.status(200).json(successResponse('Feedback updated', { report }));
});

module.exports = { create, listMine, listAll, updateStatus };
