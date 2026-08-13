const express = require('express');
const router = express.Router();
const publicController = require('../controllers/publicController');
const upload = require('../middlewares/upload');
const { publicIntakeLimiter } = require('../middlewares/rateLimiter');

/**
 * Public, UNAUTHENTICATED intake surface. Nothing here requires a login - it
 * exposes only published programs, a cohort apply form behind a shareable slug,
 * and an applicant's own record behind their magic-link token.
 *
 * Because anyone on the internet can reach these, every WRITE is rate-limited:
 * without it, `/apply` is an open endpoint that creates rows and sends email, and
 * `/upload` is an open endpoint that pushes files to our Cloudinary account.
 * Reads (catalog, cohort page) stay unlimited — they are cacheable and harmless.
 */

// Program catalog
router.get('/programs', publicController.listPrograms);
router.get('/programs/:id', publicController.getProgram);

// Apply behind a cohort intake link
router.get('/cohorts/:slug', publicController.getCohort);
router.post('/cohorts/:slug/apply', publicIntakeLimiter, publicController.apply);
router.post('/cohorts/:slug/resume', publicIntakeLimiter, publicController.resume);

// Applicant status + assessment (magic-link token)
router.get('/applications/:token', publicController.getStatus);
router.patch('/applications/:token', publicIntakeLimiter, publicController.updateInfo);
router.post('/applications/:token/withdraw', publicIntakeLimiter, publicController.withdraw);
router.post('/applications/:token/assessment', publicIntakeLimiter, publicController.submitAssessment);
router.post(
  '/applications/:token/upload',
  publicIntakeLimiter,
  upload.singleSafe('file'),
  publicController.uploadFile
);

module.exports = router;
