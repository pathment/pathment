const express = require('express');
const router = express.Router();
const c = require('../controllers/clanRequestsController');
const { authenticate } = require('../middlewares/auth');
const { requirePermission, requirePermissionMinScope } = require('../middlewares/authz');
const { PERMISSIONS } = require('../config/permissions');
const authzService = require('../services/authzService');
const { models } = require('../db');
const { validateBody, validateParams } = require('../middlewares/validate');
const clanRequestValidation = require('../validations/clanRequestValidation');

const adminOnly = [authenticate, requirePermissionMinScope(PERMISSIONS.CLAN_MANAGE_MEMBERS)];
// Clan-scoped: admins (org) pass anywhere; a LEAD MENTOR passes for their own clan.
const onTargetClan = (getClanId) => requirePermission(
  PERMISSIONS.CLAN_MANAGE_MEMBERS,
  async (req) => authzService.scopeOfClan(await getClanId(req))
);

/**
 * Standing clan requests (after formal program close)
 */
router.get(
  '/standing/eligible-programs',
  authenticate,
  c.listStandingEligiblePrograms
);

router.get(
  '/standing',
  authenticate,
  c.listStandingRequests
);

router.post(
  '/standing',
  authenticate,
  validateBody(clanRequestValidation.standingRequest),
  c.createStandingRequest
);

// Declared before '/standing/:id/...' routes; admin only.
router.get('/standing/settings', adminOnly, c.standingSettings);
router.put('/standing/settings', adminOnly, c.setStandingSettings);
router.post(
  '/standing/:id/decision',
  authenticate,
  validateParams(clanRequestValidation.idParams),
  validateBody(clanRequestValidation.standingDecision),
  c.decideStandingRequest
);

router.get('/', adminOnly, c.overview);

/**
 * A mentee's own clan change. Authenticated, not permissioned: the only thing
 * these can act on is the caller's own placement, which the service resolves
 * from the session rather than the body.
 *
 * Declared BEFORE '/requests' so 'my-move' is never swallowed by a parameter
 * segment, and kept on its own path rather than sharing the admin route with a
 * role check inside - authority belongs at the route, where it can be read.
 */
router.get('/my-move', authenticate, c.myClanChangeOptions);
router.post(
  '/my-move',
  authenticate,
  validateBody(clanRequestValidation.ownMove),
  c.requestOwnMove,
);
router.post(
  '/my-move/:id/cancel',
  authenticate,
  validateParams(clanRequestValidation.idParams),
  c.cancelOwnMove,
);

/*
 * Change requests, raised from the admin console and resolved there.
 *
 * The POST was `authenticate` only, which meant any signed-in account could
 * queue a move naming any mentee and any clan; the row was indistinguishable
 * from one an admin had raised, so approving it looked routine. Mentees now
 * have '/my-move' above, which can only ever move the caller, and mentors go
 * through menteeTransferService - so nothing legitimate was reaching this
 * route unprivileged, and it is now guarded like the resolve beside it.
 */
router.post('/requests', adminOnly, c.createRequest);
router.get(
  '/requests/:id/destinations',
  adminOnly,
  validateParams(clanRequestValidation.idParams),
  c.destinations,
);
router.patch(
  '/requests/:id/resolve',
  adminOnly,
  validateParams(clanRequestValidation.idParams),
  validateBody(clanRequestValidation.resolveMove),
  c.resolveRequest,
);

// The covering person's own surface: see + accept/decline cover requests for them.
router.get('/cross-clan/mine', authenticate, c.listMyCrossClan);
router.post('/cross-clan/:id/respond', authenticate, c.respondCrossClan);

// Cross-clan: admins manage org-wide; a clan's lead mentor manages cover for THEIR clan.
router.get('/cross-clan', authenticate, onTargetClan((req) => req.query.clanId), c.listCrossClan);
router.post('/cross-clan', authenticate, onTargetClan((req) => req.body.toClanId), c.createCrossClan);
router.delete('/cross-clan/:id', authenticate, onTargetClan(async (req) => {
  const a = await models.CrossClanAssignment.findByPk(req.params.id);
  return a ? a.toClanId : null;
}), c.removeCrossClan);

module.exports = router;
