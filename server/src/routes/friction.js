const express = require('express');
const router = express.Router();
const frictionController = require('../controllers/frictionController');
const { authenticate } = require('../middlewares/auth');
const { requirePermission, scope } = require('../middlewares/authz');
const { PERMISSIONS } = require('../config/permissions');

/**
 * Blockers and delay events (mounted at root: /api/blockers, /api/delays).
 * Any authenticated user may list/create against their own/their mentees'
 * records; accepting a delay is a mentor/admin action.
 */

// Blockers
router.get('/blockers', authenticate, frictionController.listBlockers);
router.post('/blockers', authenticate, frictionController.createBlocker);
router.patch('/blockers/:id/resolve', authenticate, frictionController.resolveBlocker);
// Delete is owner-scoped in the service (a mentee can only delete their own).
router.delete('/blockers/:id', authenticate, frictionController.deleteBlocker);

// Delays
router.get('/delays', authenticate, frictionController.listDelays);
router.post('/delays', authenticate, frictionController.createDelay);
router.patch('/delays/:id/accept', authenticate, requirePermission(PERMISSIONS.TASK_REVIEW, scope.delay('id')), frictionController.acceptDelay);
// Reject marks the delay rejected (history kept). DELETE kept as an alias for older clients.
router.patch('/delays/:id/reject', authenticate, requirePermission(PERMISSIONS.TASK_REVIEW, scope.delay('id')), frictionController.rejectDelay);
router.delete('/delays/:id', authenticate, requirePermission(PERMISSIONS.TASK_REVIEW, scope.delay('id')), frictionController.rejectDelay);

module.exports = router;
