const express = require('express');
const router = express.Router();
const interviewController = require('../controllers/interviewController');
const { authenticate } = require('../middlewares/auth');
const { requirePermissionAnyScope } = require('../middlewares/authz');
const { PERMISSIONS } = require('../config/permissions');
const upload = require('../middlewares/upload');

// Authoring interview kits is a task-authoring action — any mentor/admin who can
// assign tasks somewhere may build kits. Ownership is enforced per-kit in the
// service (createdBy), so no resource scope is needed here.
const canAuthor = requirePermissionAnyScope(PERMISSIONS.TASK_ASSIGN);

router.get('/kits', authenticate, canAuthor, interviewController.listKits);
router.post('/kits/prompt-audio', authenticate, canAuthor, upload.singleSafeLarge('audio'), interviewController.uploadPromptAudio);
router.post('/kits', authenticate, canAuthor, interviewController.createKit);
router.get('/kits/:id', authenticate, canAuthor, interviewController.getKit);
router.patch('/kits/:id', authenticate, canAuthor, interviewController.updateKit);
router.delete('/kits/:id', authenticate, canAuthor, interviewController.deleteKit);

// Candidate runner — any authenticated user; the service asserts task ownership.
router.get('/assignments/:taskId/manage', authenticate, canAuthor, interviewController.getAssignmentForMentor);
router.patch('/assignments/:taskId/options', authenticate, canAuthor, interviewController.updateAssignmentOptions);
router.post('/assignments/:taskId/abandon', authenticate, canAuthor, interviewController.abandonActiveInterview);
router.get('/assignments/:taskId', authenticate, interviewController.getCandidateInterview);
router.post('/assignments/:taskId/start', authenticate, interviewController.startInterview);
router.post('/sessions/:sessionId/question/start', authenticate, interviewController.startQuestion);
router.patch('/sessions/:sessionId/answer', authenticate, interviewController.saveAnswer);
router.post('/sessions/:sessionId/audio', authenticate, upload.singleSafeLarge('audio'), interviewController.uploadAnswerAudio);
router.post('/sessions/:sessionId/proctor', authenticate, interviewController.logProctor);
router.post('/sessions/:sessionId/snapshot', authenticate, upload.singleSafe('image'), interviewController.uploadSnapshot);
router.post('/sessions/:sessionId/submit', authenticate, interviewController.submitInterview);

// Mentor review — permission (task.review, co-mentor aware) enforced in the service.
router.get('/review/:taskId', authenticate, interviewController.getInterviewReview);
router.patch('/review/:taskId/answer', authenticate, interviewController.gradeInterviewAnswer);
router.post('/review/:taskId/ai-draft', authenticate, interviewController.aiDraftInterviewAnswer);
router.post('/review/:taskId/ai-draft-all', authenticate, interviewController.aiDraftAllInterview);
router.post('/review/:taskId/finalize', authenticate, interviewController.finalizeInterviewReview);
router.post('/review/:taskId/request-redo', authenticate, interviewController.requestInterviewRedo);
router.delete('/review/:taskId/snapshots', authenticate, interviewController.deleteInterviewSnapshots);
router.post('/review/:taskId/flag', authenticate, interviewController.flagInterview);

module.exports = router;
