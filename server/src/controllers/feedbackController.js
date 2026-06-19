const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const submissionService = require('../services/submissionService');
const feedbackSnippetService = require('../services/feedbackSnippetService');

/**
 * AI-draft mentor feedback for a submitted task. Lets the ValidationError
 * (no AI connection) propagate so the client can show the "not configured"
 * message.
 */
const draftFeedback = catchAsync(async (req, res) => {
  const { taskTitle, brief, criteria, decision, count } = req.body || {};
  const text = await submissionService.draftFeedback(req.user.id, { taskTitle, brief, criteria, decision, count });
  res.status(200).json(successResponse('Draft', { text }));
});

// Saved feedback snippets (per-mentor).
const listSnippets = catchAsync(async (req, res) => {
  const snippets = await feedbackSnippetService.list(req.user.id);
  res.status(200).json(successResponse('Snippets retrieved', { snippets }));
});

const createSnippet = catchAsync(async (req, res) => {
  const { label, body } = req.body || {};
  const snippet = await feedbackSnippetService.create(req.user.id, { label, body });
  res.status(201).json(successResponse('Snippet saved', { snippet }, 201));
});

const removeSnippet = catchAsync(async (req, res) => {
  const result = await feedbackSnippetService.remove(req.user.id, req.params.id);
  res.status(200).json(successResponse('Snippet removed', result));
});

module.exports = { draftFeedback, listSnippets, createSnippet, removeSnippet };
