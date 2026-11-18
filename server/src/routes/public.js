const express = require('express');
const router = express.Router();
const publicController = require('../controllers/publicController');
const clanController = require('../controllers/clanController');
const upload = require('../middlewares/upload');
const { publicIntakeLimiter, assessmentAttemptLimiter, certificateVerifyLimiter } = require('../middlewares/rateLimiter');
const { authenticate, optionalAuth } = require('../middlewares/auth');
const { validateBody } = require('../middlewares/validate');
const clanSchemas = require('../validations/clanValidation');

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

// ── Credential verification ─────────────────────────────────────────────────
// Deliberately unauthenticated: the reason a number is printed on a certificate
// is so a stranger reading a CV can check it. The response carries only what
// confirms the claim — see certificateService.verifyByNumber.
router.get('/verify/:number', certificateVerifyLimiter, publicController.verifyCertificate);
router.patch('/applications/:token', publicIntakeLimiter, publicController.updateInfo);
router.post('/applications/:token/withdraw', publicIntakeLimiter, publicController.withdraw);
// Per private link, like the rest of the attempt: a classroom submitting together shares one IP.
router.post('/applications/:token/assessment', assessmentAttemptLimiter, publicController.submitAssessment);
// Taking the assessment: start (clock + capability check), autosave, proctoring, video answers.
router.post('/applications/:token/assessment/start', assessmentAttemptLimiter, publicController.startAssessment);
router.patch('/applications/:token/assessment/draft', assessmentAttemptLimiter, publicController.saveAssessmentDraft);
router.post('/applications/:token/assessment/proctor', assessmentAttemptLimiter, publicController.logAssessmentProctor);
router.post('/applications/:token/assessment/snapshot', assessmentAttemptLimiter, upload.singleSafe('image'), publicController.uploadAssessmentSnapshot);
router.post('/applications/:token/assessment/video/sign', assessmentAttemptLimiter, publicController.signAssessmentVideo);
router.post('/applications/:token/assessment/video', assessmentAttemptLimiter, upload.singleSafeLarge('video'), publicController.attachAssessmentVideo);
router.post(
  '/applications/:token/upload',
  publicIntakeLimiter,
  upload.singleSafe('file'),
  publicController.uploadFile
);

// Public clan joining link (opaque token). GET may include optional auth so an
// already-logged-in visitor sees membership/pending state. POST requires auth.
router.get(
  '/clans/join/:token',
  optionalAuth,
  clanController.getPublicClanJoin
);
router.post(
  '/clans/join/:token/request',
  publicIntakeLimiter,
  authenticate,
  validateBody(clanSchemas.publicJoinRequestBody),
  clanController.submitPublicJoinRequest
);

module.exports = router;
