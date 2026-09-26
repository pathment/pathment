const express = require('express');
const Joi = require('joi');
const gamificationController = require('../controllers/gamificationController');
const { authenticate, authorize, optionalAuth } = require('../middlewares/auth');
const { requirePermissionMinScope } = require('../middlewares/authz');
const { PERMISSIONS } = require('../config/permissions');
const { validate } = require('../middlewares/validate');
const upload = require('../middlewares/upload');
const { BADGE_ICON_PRESETS } = require('../utils/badgeIcons');

const router = express.Router();

// Public routes.
//
// The leaderboard takes `optionalAuth` rather than nothing: it ranks by the
// progress score, two of whose dimensions are percentiles, so the peer group is
// part of the answer and the caller's own programme is the sensible one. Left
// unauthenticated it had no way to know that and returned an empty board to
// every signed-in mentee. Anonymous callers still reach it and can name a
// programme with ?programId=; without either there is no peer group and so no
// honest ranking to give.
router.get('/leaderboard', optionalAuth, gamificationController.getLeaderboard);
router.get('/badges', authenticate, gamificationController.getAllBadges);
router.get('/challenges', gamificationController.getAllChallenges);

// User-centric routes (authenticated; controller enforces ownership / role checks)
router.get('/user/:userId/stats', authenticate, gamificationController.getUserStats);
router.get('/user/:userId/badges', authenticate, gamificationController.getUserBadges);
router.get('/user/:userId/badge-catalog', authenticate, gamificationController.getBadgeCatalog);
router.get('/user/:userId/points-history', authenticate, gamificationController.getUserPointsHistory);
router.get('/challenges/user/:userId', authenticate, gamificationController.getUserChallenges);

// Authenticated challenge participation
router.post(
  '/challenges/:challengeId/join',
  authenticate,
  authorize(['mentee', 'mentor']),
  gamificationController.joinChallenge
);

// Admin routes
const presetIcon = Joi.string().valid(...BADGE_ICON_PRESETS, ...BADGE_ICON_PRESETS.map((k) => `preset:${k}`));
const badgeFields = {
  name: Joi.string().trim().max(100), description: Joi.string().trim().max(2000),
  category: Joi.string().max(50), audience: Joi.string().valid('mentee', 'mentor'),
  criteriaType: Joi.string().valid(
    'custom', 'tasks_completed', 'programs_completed', 'badges_earned', 'streak_days',
    'points_milestone', 'avg_rating', 'level_reached', 'skill_mastery',
    'mentor_accepted_answers', 'mentor_qualifying_reviews', 'mentor_distinct_mentees',
    'mentor_rating', 'mentor_sessions_finished', 'mentor_cert_verifications'
  ),
  criteriaValue: Joi.object({
    count: Joi.number().integer().min(1), days: Joi.number().integer().min(1),
    threshold: Joi.number().integer().min(1), minRating: Joi.number().min(0.1).max(5),
    level: Joi.number().integer().min(1).max(5), manual: Joi.boolean(),
    skillId: Joi.string().uuid(), minProficiency: Joi.number().min(0.1),
    menteeCount: Joi.number().integer().min(1), minReviews: Joi.number().integer().min(3).max(100),
  }),
  pointsReward: Joi.number().integer().min(0).max(10000), isActive: Joi.boolean(), isSecret: Joi.boolean(),
  // null clears; preset key or Cloudinary pathment/badges URL (enforced again in saveBadge).
  iconUrl: Joi.alternatives().try(presetIcon, Joi.string().uri({ scheme: ['https'] }), Joi.valid(null)).allow(null),
};
const manage = requirePermissionMinScope(PERMISSIONS.GAMIFICATION_MANAGE);
router.get('/badge-recipients', authenticate, manage, gamificationController.badgeRecipients);
router.get('/badges/:id/history', authenticate, manage, gamificationController.badgeHistory);
router.post('/badges/upload', authenticate, manage, upload.singleSafe('file'), gamificationController.uploadBadgeImage);
router.patch('/badges/:id', authenticate, manage,
  validate(Joi.object({ ...badgeFields, retire: Joi.boolean().valid(true) }).min(1)), gamificationController.updateBadge);
router.post('/badges/:id/revoke', authenticate, manage,
  validate(Joi.object({ userId: Joi.string().uuid().required(), reason: Joi.string().trim().min(10).max(2000).required() })), gamificationController.revokeBadge);
router.post(
  '/badges',
  authenticate,
  requirePermissionMinScope(PERMISSIONS.GAMIFICATION_MANAGE),
  validate(Joi.object(badgeFields).fork(['name', 'description', 'category', 'criteriaType', 'criteriaValue'], schema => schema.required())),
  gamificationController.createBadge
);

router.post(
  '/badges/award',
  authenticate,
  requirePermissionMinScope(PERMISSIONS.GAMIFICATION_MANAGE),
  validate(Joi.object({
    userId: Joi.string().uuid().required(),
    badgeId: Joi.string().uuid().required(),
    context: Joi.object({ reason: Joi.string().trim().min(10).max(2000).required() }).required()
  })),
  gamificationController.awardBadgeManual
);

router.post(
  '/setup-badges',
  authenticate,
  requirePermissionMinScope(PERMISSIONS.GAMIFICATION_MANAGE),
  gamificationController.setupDefaultBadges
);

module.exports = router;
