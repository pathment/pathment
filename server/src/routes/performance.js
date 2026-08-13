const express = require('express');
const router = express.Router();
const performanceController = require('../controllers/performanceController');
const { authenticate, authorize } = require('../middlewares/auth');
const { requirePermissionMinScope } = require('../middlewares/authz');
const { PERMISSIONS } = require('../config/permissions');

// A mentee's own score. Any signed-in mentee; the controller scopes it to them.
router.get('/me', authenticate, performanceController.myPerformance);

// One clan, ranked. The controller checks the caller actually runs it.
router.get(
  '/clan/:clanId',
  authenticate,
  authorize(['mentor', 'admin']),
  performanceController.clanLeaderboard
);

// What the score is made of. Readable by anyone who can see a clan's numbers,
// because a score nobody can inspect is a score nobody should trust.
router.get(
  '/settings',
  authenticate,
  authorize(['mentor', 'admin']),
  performanceController.getSettings
);

// The org's weights are an admin decision: they decide what the whole
// organisation means by "doing well".
router.put(
  '/settings',
  authenticate,
  requirePermissionMinScope(PERMISSIONS.SYSTEM_SETTINGS),
  performanceController.setOrgSettings
);

// A mentor may switch a dimension off for their own clan, never back on.
router.put(
  '/clan/:clanId/settings',
  authenticate,
  authorize(['mentor', 'admin']),
  performanceController.setClanSettings
);

module.exports = router;
