const express = require('express');
const router = express.Router();
const intakeController = require('../controllers/intakeController');
const { authenticate } = require('../middlewares/auth');
const { requirePermission, requirePermissionMinScope } = require('../middlewares/authz');
const { PERMISSIONS } = require('../config/permissions');

// Intake (cohorts, applications, links) requires intake.manage; super_admin,
// intake_manager and program_admin hold it. Org-scoped - same gate everywhere.
const adminOnly = [authenticate, requirePermissionMinScope(PERMISSIONS.INTAKE_MANAGE)];

// ─── Cohorts ─────────────────────────────────────────────────────────────────
router.get('/cohorts', ...adminOnly, intakeController.listCohorts);
router.post('/cohorts', ...adminOnly, intakeController.createCohort);
router.get('/cohorts/:id', ...adminOnly, intakeController.getCohort);
router.patch('/cohorts/:id', ...adminOnly, intakeController.updateCohort);

// Public intake link management
router.post('/cohorts/:id/public-link', ...adminOnly, intakeController.enablePublicLink);
router.delete('/cohorts/:id/public-link', ...adminOnly, intakeController.disablePublicLink);
// Copy form + assessment config from another cohort
router.post('/cohorts/:id/clone-intake', ...adminOnly, intakeController.cloneIntake);
// Get-or-create this cohort's assessment (inline builder)
router.post('/cohorts/:id/assessment', ...adminOnly, intakeController.ensureCohortAssessment);
// The cohort's assessment pool (multiple, optionally per-level, randomly assigned)
router.get('/cohorts/:id/assessments', ...adminOnly, intakeController.getCohortAssessments);
router.put('/cohorts/:id/assessments', ...adminOnly, intakeController.setCohortAssessments);

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
