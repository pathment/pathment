const express = require('express');
const router = express.Router();
const publicController = require('../controllers/publicController');
const upload = require('../middlewares/upload');

/**
 * Public, UNAUTHENTICATED intake surface. Nothing here requires a login - it
 * exposes only published programs, a cohort apply form behind a shareable slug,
 * and an applicant's own record behind their magic-link token.
 */

// Program catalog
router.get('/programs', publicController.listPrograms);
router.get('/programs/:id', publicController.getProgram);

// Apply behind a cohort intake link
router.get('/cohorts/:slug', publicController.getCohort);
router.post('/cohorts/:slug/apply', publicController.apply);
router.post('/cohorts/:slug/resume', publicController.resume);

// Applicant status + assessment (magic-link token)
router.get('/applications/:token', publicController.getStatus);
router.patch('/applications/:token', publicController.updateInfo);
router.post('/applications/:token/withdraw', publicController.withdraw);
router.post('/applications/:token/assessment', publicController.submitAssessment);
router.post('/applications/:token/upload', upload.singleSafe('file'), publicController.uploadFile);

module.exports = router;
