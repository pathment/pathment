const express = require('express');
const router = express.Router();
const c = require('../controllers/rewardsController');
const { authenticate } = require('../middlewares/auth');
const { requirePermission, requirePermissionAnyScope, requirePermissionMinScope, scope } = require('../middlewares/authz');
const { PERMISSIONS } = require('../config/permissions');
const upload = require('../middlewares/upload');

// Catalog + redemptions — needs mentee.view (clan mentors + admins); per-mentee
// actions are scoped to that mentee, the overview to any clan you mentor.
router.get('/', authenticate, requirePermissionAnyScope(PERMISSIONS.MENTEE_VIEW), c.overview);
router.post('/redeem', authenticate, requirePermission(PERMISSIONS.MENTEE_VIEW, scope.menteeBody('menteeId')), c.redeem);
router.get('/balance/:menteeId', authenticate, requirePermission(PERMISSIONS.MENTEE_VIEW, scope.mentee('menteeId')), c.menteeBalance);

// Catalog management (admin only).
router.post('/gifts/upload', authenticate, requirePermissionMinScope(PERMISSIONS.GAMIFICATION_MANAGE), upload.singleSafe('file'), c.uploadGiftImage);
router.post('/gifts', authenticate, requirePermissionMinScope(PERMISSIONS.GAMIFICATION_MANAGE), c.createGift);
router.patch('/gifts/:id', authenticate, requirePermissionMinScope(PERMISSIONS.GAMIFICATION_MANAGE), c.updateGift);
router.delete('/gifts/:id', authenticate, requirePermissionMinScope(PERMISSIONS.GAMIFICATION_MANAGE), c.removeGift);

module.exports = router;
