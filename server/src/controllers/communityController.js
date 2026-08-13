const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const communityService = require('../services/communityService');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');

// Upload images/files for a post; returns attachment descriptors the client
// then includes in createPost ({ url, name, kind }).
const uploadAttachments = catchAsync(async (req, res) => {
  const files = req.files || [];
  const attachments = [];
  for (const f of files) {
    const isImage = (f.mimetype || '').startsWith('image/');
    const result = await uploadToCloudinary(f.buffer, 'pathment/community', isImage ? 'image' : 'raw');
    attachments.push({ url: result.secure_url, name: f.originalname, kind: isImage ? 'image' : 'file' });
  }
  res.status(200).json(successResponse('Uploaded', { attachments }));
});

// ── spaces ────────────────────────────────────────────────────────────────
const listSpaces = catchAsync(async (req, res) => {
  const spaces = await communityService.listSpaces(req.user);
  res.status(200).json(successResponse('Spaces retrieved', { spaces }));
});

const members = catchAsync(async (req, res) => {
  const { scopeType, scopeId } = req.query;
  const data = await communityService.getMembers(req.user, scopeType, scopeId || null);
  res.status(200).json(successResponse('Members retrieved', { members: data }));
});

const people = catchAsync(async (req, res) => {
  const { scopeType, scopeId } = req.query;
  const data = await communityService.getPeople(req.user, scopeType || null, scopeId || null);
  res.status(200).json(successResponse('People retrieved', { people: data }));
});

const leaderboard = catchAsync(async (req, res) => {
  const { scopeType, scopeId, period } = req.query;
  const data = await communityService.getLeaderboard(req.user, {
    scopeType: scopeType || 'global',
    scopeId: scopeId || null,
    period: period === 'week' ? 'week' : 'all'
  });
  res.status(200).json(successResponse('Leaderboard retrieved', data));
});

// ── feed ────────────────────────────────────────────────────────────────
const feed = catchAsync(async (req, res) => {
  const { scopeType, scopeId, type, tag, q, before, limit } = req.query;
  const data = await communityService.feed(req.user, {
    scopeType: scopeType || 'global',
    scopeId: scopeId || null,
    type: type || null,
    tag: tag || null,
    q: q || null,
    before: before || null,
    limit
  });
  res.status(200).json(successResponse('Community feed retrieved', data));
});

// ── posts ────────────────────────────────────────────────────────────────
const createPost = catchAsync(async (req, res) => {
  const post = await communityService.createPost(req.user, req.body);
  res.status(201).json(successResponse('Posted', { post }, 201));
});

const updatePost = catchAsync(async (req, res) => {
  const post = await communityService.updatePost(req.user, req.params.id, req.body);
  res.status(200).json(successResponse('Post updated', { post }));
});

const deletePost = catchAsync(async (req, res) => {
  const result = await communityService.deletePost(req.user, req.params.id);
  res.status(200).json(successResponse('Post removed', result));
});

const pinPost = catchAsync(async (req, res) => {
  const result = await communityService.setPinned(req.user, req.params.id, Boolean(req.body.pinned));
  res.status(200).json(successResponse('Pin updated', result));
});

const react = catchAsync(async (req, res) => {
  const result = await communityService.toggleReaction(req.user, req.params.id, req.body.type);
  res.status(200).json(successResponse('Reaction updated', result));
});

// ── comments ────────────────────────────────────────────────────────────
const listComments = catchAsync(async (req, res) => {
  const comments = await communityService.listComments(req.user, req.params.id);
  res.status(200).json(successResponse('Comments retrieved', { comments }));
});

const addComment = catchAsync(async (req, res) => {
  const comment = await communityService.addComment(req.user, req.params.id, req.body);
  res.status(201).json(successResponse('Reply posted', { comment }, 201));
});

const updateComment = catchAsync(async (req, res) => {
  const comment = await communityService.updateComment(req.user, req.params.id, req.body.body);
  res.status(200).json(successResponse('Reply updated', { comment }));
});

const deleteComment = catchAsync(async (req, res) => {
  const result = await communityService.deleteComment(req.user, req.params.id);
  res.status(200).json(successResponse('Reply removed', result));
});

const acceptAnswer = catchAsync(async (req, res) => {
  const result = await communityService.acceptAnswer(req.user, req.params.id, req.body.commentId);
  res.status(200).json(successResponse('Answer accepted', result));
});

// ── moderation ────────────────────────────────────────────────────────────
const report = catchAsync(async (req, res) => {
  const result = await communityService.report(req.user, req.body);
  res.status(201).json(successResponse('Reported', result, 201));
});

const listReports = catchAsync(async (req, res) => {
  const reports = await communityService.listReports(req.user, { status: req.query.status || 'open' });
  res.status(200).json(successResponse('Reports retrieved', { reports }));
});

const resolveReport = catchAsync(async (req, res) => {
  const result = await communityService.resolveReport(req.user, req.params.id, req.body.status);
  res.status(200).json(successResponse('Report updated', result));
});

module.exports = {
  listSpaces, members, people, leaderboard, feed, uploadAttachments,
  createPost, updatePost, deletePost, pinPost, react,
  listComments, addComment, updateComment, deleteComment, acceptAnswer,
  report, listReports, resolveReport
};
