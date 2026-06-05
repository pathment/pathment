const express = require('express');
const router = express.Router();
const assessmentController = require('../controllers/assessmentController');
const { authenticate, authorize } = require('../middlewares/auth');

// Assessment authoring is admin-only.
const adminOnly = [authenticate, authorize(['admin'])];

router.get('/', ...adminOnly, assessmentController.listAssessments);
router.post('/', ...adminOnly, assessmentController.createAssessment);
router.get('/:id', ...adminOnly, assessmentController.getAssessment);
router.patch('/:id', ...adminOnly, assessmentController.updateAssessment);
router.put('/:id/questions', ...adminOnly, assessmentController.setQuestions);
router.delete('/:id', ...adminOnly, assessmentController.deleteAssessment);

module.exports = router;
