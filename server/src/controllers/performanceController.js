const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const { models } = require('../db');
const performanceService = require('../services/performanceService');
const scoringSettingsService = require('../services/scoringSettingsService');
const cohortService = require('../services/cohortService');
const authzService = require('../services/authzService');
const { ForbiddenError, NotFoundError } = require('../utils/errors/errorTypes');

/**
 * Performance scores.
 *
 * A mentee may see their own score and their standing inside their own clan.
 * They may not see anybody else's parts, because the parts include a quality
 * number derived from their mentor's grading and that is not theirs to read
 * about a peer.
 */

/** Every clan this person runs, or throws if they do not run the one asked for. */
async function assertRunsClan(user, clanId) {
  if (user.role === 'admin') return;
  const clanIds = await authzService.mentoredClanIds(user.id);
  if (!clanIds.includes(clanId)) {
    throw new ForbiddenError('You do not run that clan');
  }
}

/**
 * GET /api/performance/clan/:clanId
 * The ranked clan, with everyone who was left out and why.
 */
exports.clanLeaderboard = catchAsync(async (req, res) => {
  await assertRunsClan(req.user, req.params.clanId);

  const limit = req.query.limit ? Number(req.query.limit) : null;
  const result = await performanceService.clanLeaderboard(req.params.clanId, {
    limit: Number.isFinite(limit) && limit > 0 ? limit : null
  });

  res.status(200).json(successResponse('Clan performance retrieved', result));
});

/**
 * GET /api/performance/me
 * A mentee's own score, and where they sit among the people they train with.
 *
 * The peer scores are computed (they have to be, since output and quality are
 * relative) but only the rank is returned. Nobody needs their peers' parts.
 */
exports.myPerformance = catchAsync(async (req, res) => {
  const membership = await models.ClanMembership.findOne({
    where: { userId: req.user.id, role: 'mentee', status: 'active' },
    attributes: ['clanId']
  });

  if (!membership) {
    return res.status(200).json(
      successResponse('No clan yet', {
        score: null,
        band: 'Not enough yet',
        parts: [],
        rank: null,
        outOf: 0,
        reason: 'You are not in a clan yet, so there is nobody to compare with.'
      })
    );
  }

  const menteeIds = await cohortService.resolveMenteeIdsForClan(membership.clanId);
  const { mentees, weights, disabled } = await performanceService.scoreMentees(menteeIds, {
    clanId: membership.clanId
  });

  const me = mentees.find((m) => m.id === req.user.id);
  if (!me) throw new NotFoundError('No performance record yet');

  const ranked = mentees
    .filter((m) => m.eligible)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const rank = ranked.findIndex((m) => m.id === req.user.id);

  res.status(200).json(
    successResponse('Performance retrieved', {
      score: me.score,
      band: me.band,
      parts: me.parts,
      covered: me.covered,
      evidence: me.evidence,
      eligible: me.eligible,
      notRankedBecause: me.notRankedBecause,
      rank: rank >= 0 ? rank + 1 : null,
      outOf: ranked.length,
      weights,
      disabled
    })
  );
});

/**
 * GET /api/performance/settings
 * The org's weights, and which dimensions are switched off where.
 */
exports.getSettings = catchAsync(async (req, res) => {
  const clanId = req.query.clanId || null;
  if (clanId) await assertRunsClan(req.user, clanId);

  const effective = await scoringSettingsService.effectiveWeights(clanId);
  const org = await scoringSettingsService.getOrgSettings();

  res.status(200).json(
    successResponse('Scoring settings retrieved', { ...effective, orgDisabled: org.disabled })
  );
});

/**
 * PUT /api/performance/settings
 * Admin only: the weights, and what is off for everybody.
 */
exports.setOrgSettings = catchAsync(async (req, res) => {
  const saved = await scoringSettingsService.setOrgSettings(
    { weights: req.body.weights, disabled: req.body.disabled },
    req.user.id
  );
  res.status(200).json(successResponse('Scoring settings saved', saved));
});

/**
 * PUT /api/performance/clan/:clanId/settings
 * A mentor switching a dimension off for their own clan.
 *
 * They can only ever switch MORE off. Turning something back on that the org
 * disabled would make their mentees incomparable with everyone else's, so the
 * service takes the union and this endpoint does not pretend otherwise.
 */
exports.setClanSettings = catchAsync(async (req, res) => {
  await assertRunsClan(req.user, req.params.clanId);

  await scoringSettingsService.setClanDisabled(
    req.params.clanId,
    req.body.disabled,
    req.user.id
  );

  const effective = await scoringSettingsService.effectiveWeights(req.params.clanId);
  res.status(200).json(successResponse('Clan scoring updated', effective));
});
