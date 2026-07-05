const express = require('express');
const router = express.Router();
const quizController = require('../controllers/quizController');
const { authenticate } = require('../middlewares/auth');
const { requirePermissionAnyScope } = require('../middlewares/authz');
const { PERMISSIONS } = require('../config/permissions');

// Authoring quiz kits is a task-authoring action — any mentor/admin who can assign
// tasks somewhere may build kits. Ownership is enforced per-kit in the service.
const canAuthor = requirePermissionAnyScope(PERMISSIONS.TASK_ASSIGN);

router.get('/kits', authenticate, canAuthor, quizController.listKits);
router.post('/kits', authenticate, canAuthor, quizController.createKit);
router.get('/kits/:id', authenticate, canAuthor, quizController.getKit);
router.patch('/kits/:id', authenticate, canAuthor, quizController.updateKit);
router.delete('/kits/:id', authenticate, canAuthor, quizController.deleteKit);

// Candidate runner — any authenticated user; the service asserts task ownership.
router.get('/assignments/:taskId', authenticate, quizController.getCandidateQuiz);
router.post('/assignments/:taskId/start', authenticate, quizController.startQuiz);
router.patch('/sessions/:sessionId/answer', authenticate, quizController.saveAnswer);
router.post('/sessions/:sessionId/submit', authenticate, quizController.submitQuiz);

// Mentor review — permission (task.review, co-mentor aware) enforced in the service.
router.get('/review/:taskId', authenticate, quizController.getQuizReview);
router.patch('/review/:taskId/answer', authenticate, quizController.gradeQuizAnswer);
router.post('/review/:taskId/finalize', authenticate, quizController.finalizeQuizReview);

module.exports = router;
