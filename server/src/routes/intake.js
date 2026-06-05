const express = require('express');
const router = express.Router();
const intakeController = require('../controllers/intakeController');
const { authenticate, authorize } = require('../middlewares/auth');

// All intake routes are admin-only.
const adminOnly = [authenticate, authorize(['admin'])];

// ─── Cohorts ─────────────────────────────────────────────────────────────────
router.get('/cohorts', ...adminOnly, intakeController.listCohorts);
router.post('/cohorts', ...adminOnly, intakeController.createCohort);
router.get('/cohorts/:id', ...adminOnly, intakeController.getCohort);
router.patch('/cohorts/:id', ...adminOnly, intakeController.updateCohort);

// Public intake link management
router.post('/cohorts/:id/public-link', ...adminOnly, intakeController.enablePublicLink);
router.delete('/cohorts/:id/public-link', ...adminOnly, intakeController.disablePublicLink);

// ─── Applications (scoped to a cohort) ─────────────────────────────────────────
router.get('/cohorts/:id/applications', ...adminOnly, intakeController.listApplications);
router.post('/cohorts/:id/applications', ...adminOnly, intakeController.createApplication);
router.post('/cohorts/:id/applications/import', ...adminOnly, intakeController.importApplications);

// ─── Application actions ───────────────────────────────────────────────────────
router.get('/applications/:id', ...adminOnly, intakeController.getApplication);
router.patch('/applications/:id', ...adminOnly, intakeController.updateApplication);
router.post('/applications/:id/accept', ...adminOnly, intakeController.acceptApplication);
router.post('/applications/:id/reject', ...adminOnly, intakeController.rejectApplication);
router.post('/assessment-submissions/:submissionId/grade', ...adminOnly, intakeController.gradeAssessmentSubmission);

module.exports = router;
