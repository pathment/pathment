const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middlewares/auth');
const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const readinessService = require('../features/rag/services/readinessService');
const { RagFacade } = require('../features/rag');

/**
 * Auto reply: the mentor's own setup for it.
 *
 * Every route here is scoped to the caller. A mentor's material, their writing
 * style and their key are theirs, and nothing takes a mentorId from the client.
 */

const mentorOnly = [authenticate, authorize(['mentor', 'admin'])];

/** What is set up, what is missing, and what to do next. */
router.get(
  '/',
  mentorOnly,
  catchAsync(async (req, res) => {
    const readiness = await readinessService.getReadiness(req.user.id);
    res.status(200).json(successResponse('Auto reply status retrieved', readiness));
  })
);

/**
 * Turn it on or off. Refused when the prerequisites are not met, whatever the
 * screen believes.
 */
router.put(
  '/',
  mentorOnly,
  catchAsync(async (req, res) => {
    const readiness = await readinessService.setAutoReply(req.user.id, Boolean(req.body.enabled));
    res.status(200).json(successResponse('Auto reply updated', readiness));
  })
);

/** The material replies are grounded in. */
router.get(
  '/documents',
  mentorOnly,
  catchAsync(async (req, res) => {
    const documents = await RagFacade.getMentorDocuments(req.user.id);
    res.status(200).json(successResponse('Documents retrieved', { documents }));
  })
);

router.delete(
  '/documents/:id',
  mentorOnly,
  catchAsync(async (req, res) => {
    await RagFacade.deleteMentorDocument(req.params.id, req.user.id);
    res.status(200).json(successResponse('Document removed', { id: req.params.id }));
  })
);

/** Replies waiting for the mentor to read before they go out. */
router.get(
  '/drafts',
  mentorOnly,
  catchAsync(async (req, res) => {
    const drafts = await RagFacade.listPendingDrafts(req.user.id);
    res.status(200).json(successResponse('Drafts retrieved', { drafts }));
  })
);

router.post(
  '/drafts/:id/approve',
  mentorOnly,
  catchAsync(async (req, res) => {
    const draft = await RagFacade.approveDraft(req.params.id, req.user.id, req.body.finalText);
    res.status(200).json(successResponse('Draft sent', { draft }));
  })
);

router.post(
  '/drafts/:id/reject',
  mentorOnly,
  catchAsync(async (req, res) => {
    await RagFacade.rejectDraft(req.params.id, req.user.id);
    res.status(200).json(successResponse('Draft discarded', { id: req.params.id }));
  })
);

module.exports = router;
