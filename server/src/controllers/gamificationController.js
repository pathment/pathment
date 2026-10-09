const authzService = require('../services/authzService');
const gamificationService = require('../services/gamificationService');
const { models } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');
const { successResponse } = require('../utils/responses');
const { catchAsync } = require('../middlewares/errorHandler');

/**
 * Get user's gamification stats (points, level, badges, streak, etc)
 * GET /api/gamification/user/:userId/stats
 */
exports.getUserStats = catchAsync(async (req, res) => {
  const { userId } = req.params;

  // Security: Users can view their own stats, or mentors/admins can view mentee stats
  if (!req.user || !(await authzService.canViewMentee(req.user, userId))) {
    return res.status(403).json({ success: false, message: 'Forbidden - cannot view other user stats' });
  }

  const stats = await gamificationService.getUserGamificationStats(userId);

  res.status(200).json(
    successResponse('Gamification stats retrieved', { stats })
  );
});

/**
 * Get user's badges
 * GET /api/gamification/user/:userId/badges
 */
exports.getUserBadges = catchAsync(async (req, res) => {
  const { userId } = req.params;

  if (!req.user || !(await authzService.canViewMentee(req.user, userId))) {
    return res.status(403).json({ success: false, message: 'Forbidden - cannot view other user badges' });
  }

  const badges = await gamificationService.getUserBadges(userId);

  res.status(200).json(
    successResponse('User badges retrieved', { badges })
  );
});

/**
 * Get user's points history
 * GET /api/gamification/user/:userId/points-history?limit=50
 */
exports.getUserPointsHistory = catchAsync(async (req, res) => {
  const { userId } = req.params;
  const { limit = 50 } = req.query;

  if (!req.user || !(await authzService.canViewMentee(req.user, userId))) {
    return res.status(403).json({ success: false, message: 'Forbidden - cannot view other user points history' });
  }

  const history = await gamificationService.getUserPointsHistory(userId, parseInt(limit));

  res.status(200).json(
    successResponse('Points history retrieved', { history })
  );
});

/**
 * Get leaderboard
 * GET /api/gamification/leaderboard?programId=xxx&limit=50
 *
 * Ranked by the PROGRESS SCORE — the same number the mentor portal shows under
 * Teaching. There is no period: the score is a current standing, not points
 * accumulated over a window, so "this week's score" would be the same number
 * wearing a different label.
 */
exports.getLeaderboard = catchAsync(async (req, res) => {
  const { programId, limit = 50 } = req.query;

  // The peer group comes from the asker when no programme is named: two of the
  // score's dimensions are percentiles, so who you are compared against is part
  // of the answer rather than a filter on top of it.
  const leaderboard = await gamificationService.getLeaderboard({
    user: req.user,
    programId: programId || null,
    limit: parseInt(limit, 10) || 50
  });

  res.status(200).json(
    successResponse('Leaderboard retrieved', { leaderboard })
  );
});

/**
 * Get all badges (for badge catalog/admin)
 * GET /api/gamification/badges?active=true
 */
exports.getAllBadges = catchAsync(async (req, res) => {
  const { active = true, role } = req.query;

  const where = active === 'true' || active === true ? { isActive: true } : {};

  let badges = await models.Badge.findAll({
    where,
    // Newest first so a just-created badge appears at the top of admin Rewards.
    order: [['createdAt', 'DESC'], ['name', 'ASC']]
  });

  if (role === 'mentee' || role === 'mentor') {
    badges = badges.filter((badge) => gamificationService.badgeTargetRole(badge) === role);
  }

  res.status(200).json(
    successResponse('Badges retrieved', { badges })
  );
});

/**
 * Create a new badge (Admin only)
 * POST /api/gamification/badges
 */
exports.createBadge = catchAsync(async (req, res) => {
  // Authorization enforced at the route (requirePermission GAMIFICATION_MANAGE),
  // which a granted admin satisfies even if their base role isn't 'admin'.
  const body = { ...req.body };
  // Normalize role onto criteriaValue so existing rows stay compatible.
  if (body.targetRole && body.criteriaValue && typeof body.criteriaValue === 'object') {
    body.criteriaValue = { ...body.criteriaValue, targetRole: body.targetRole };
    delete body.targetRole;
  }
  if (!body.criteriaValue?.targetRole) {
    body.criteriaValue = { ...(body.criteriaValue || {}), targetRole: 'mentee' };
  }
  const scope = Number(body.earningScope ?? 0);
  if (![0, 1, 2].includes(scope)) {
    throw new ValidationError('earningScope must be 0 (workspace), 1 (program), or 2 (clan)');
  }
  body.earningScope = scope;
  // Program/clan auto-progress is tasks_completed only in this release.
  if (scope !== 0 && body.criteriaType !== 'tasks_completed' && body.criteriaValue?.targetRole !== 'mentor') {
    throw new ValidationError('Program and clan badges currently support tasks_completed only');
  }
  if (body.criteriaValue?.targetRole === 'mentor' && scope !== 0) {
    throw new ValidationError('Mentor badges are workspace-scoped');
  }
  const badge = await models.Badge.create(body);

  res.status(201).json(
    successResponse('Badge created successfully', { badge }, 201)
  );
});

/**
 * Update / deactivate a badge (Admin only)
 * PATCH /api/gamification/badges/:badgeId
 */
exports.updateBadge = catchAsync(async (req, res) => {
  const badge = await models.Badge.findByPk(req.params.badgeId);
  if (!badge) throw new NotFoundError('Badge not found');

  const patch = { ...req.body };
  // Rules and scope freeze at creation — create a new badge for new requirements.
  if (
    patch.earningScope !== undefined
    && Number(patch.earningScope) !== Number(badge.earningScope ?? 0)
  ) {
    throw new ValidationError('Cannot change earning scope; create a new badge instead');
  }
  if (patch.criteriaType !== undefined && patch.criteriaType !== badge.criteriaType) {
    throw new ValidationError('Cannot change criteria type; create a new badge instead');
  }
  if (patch.criteriaValue !== undefined) {
    throw new ValidationError('Cannot change criteria; create a new badge instead');
  }
  if (patch.targetRole !== undefined) {
    throw new ValidationError('Cannot change audience; create a new badge instead');
  }
  delete patch.earningScope;
  delete patch.criteriaType;
  delete patch.criteriaValue;
  delete patch.targetRole;
  if (patch.iconUrl === '') patch.iconUrl = null;

  await badge.update(patch);
  res.status(200).json(successResponse('Badge updated', { badge }));
});

/**
 * Manually award badge to user (Admin only)
 * POST /api/gamification/badges/award
 */
exports.awardBadgeManual = catchAsync(async (req, res) => {
  // Authorization enforced at the route (requirePermission GAMIFICATION_MANAGE).

  const { userId, badgeId, context } = req.body;

  const result = await gamificationService.awardBadge(userId, badgeId, {
    ...(context || {}),
    awardMethod: 'manual',
    awardedBy: req.user?.id || null,
  });

  res.status(200).json(
    successResponse('Badge awarded successfully', result)
  );
});

/**
 * Get all challenges
 * GET /api/gamification/challenges?active=true
 */
exports.getAllChallenges = catchAsync(async (req, res) => {
  const { active = true } = req.query;

  const where = active === 'true' ? { isActive: true } : {};

  const challenges = await models.Challenge.findAll({
    where,
    include: [
      {
        model: models.User,
        as: 'creator',
        attributes: ['id', 'firstName', 'lastName']
      },
      {
        model: models.Badge,
        as: 'badge',
        attributes: ['id', 'name']
      }
    ],
    order: [['startDate', 'DESC']]
  });

  res.status(200).json(
    successResponse('Challenges retrieved', { challenges })
  );
});

/**
 * Join a challenge
 * POST /api/gamification/challenges/:challengeId/join
 */
exports.joinChallenge = catchAsync(async (req, res) => {
  const { challengeId } = req.params;
  const userId = req.user.id;

  // Check if challenge exists and is active
  const challenge = await models.Challenge.findByPk(challengeId);
  if (!challenge) {
    return res.status(404).json({ success: false, message: 'Challenge not found' });
  }

  // Check if already joined
  const existingParticipation = await models.UserChallenge.findOne({
    where: {
      userId,
      challengeId
    }
  });

  if (existingParticipation) {
    return res.status(400).json({ success: false, message: 'Already joined this challenge' });
  }

  // Create participation
  const userChallenge = await models.UserChallenge.create({
    userId,
    challengeId,
    progress: {}
  });

  // Increment challenge participants
  await challenge.increment('totalParticipants');

  res.status(201).json(
    successResponse('Joined challenge successfully', { userChallenge }, 201)
  );
});

/**
 * Get user's active challenges
 * GET /api/gamification/challenges/user/:userId
 */
exports.getUserChallenges = catchAsync(async (req, res) => {
  const { userId } = req.params;

  // Security: Users can view their own challenges, or mentors/admins can view mentee challenges
  if (!req.user || !(await authzService.canViewMentee(req.user, userId))) {
    return res.status(403).json({ success: false, message: 'Forbidden - cannot view other user challenges' });
  }

  const userChallenges = await models.UserChallenge.findAll({
    where: { userId },
    include: [
      {
        model: models.Challenge,
        as: 'challenge'
      }
    ],
    order: [['enrolledAt', 'DESC']]
  });

  res.status(200).json(
    successResponse('User challenges retrieved', { userChallenges })
  );
});

/**
 * Initialize default badges (one-time setup)
 * POST /api/gamification/setup-badges
 */
exports.setupDefaultBadges = catchAsync(async (req, res) => {
  // Authorization enforced at the route (requirePermission GAMIFICATION_MANAGE).

  const count = await gamificationService.createDefaultBadges();

  res.status(201).json(
    successResponse(`${count} default badges created/verified`, { count }, 201)
  );
});

module.exports = exports;
