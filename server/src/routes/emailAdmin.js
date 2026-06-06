const express = require('express');
const router = express.Router();
const c = require('../controllers/emailAdminController');
const { authenticate } = require('../middlewares/auth');
const { requirePermission } = require('../middlewares/authz');
const { PERMISSIONS } = require('../config/permissions');

// Email queue ops + suppression — admin only (system settings scope).
router.use(authenticate, requirePermission(PERMISSIONS.SYSTEM_SETTINGS));

router.get('/stats', c.getEmailStats);
router.get('/', c.listFailedEmails);
router.post('/retry-all-dead', c.retryAllDead);
router.post('/:id/retry', c.retryEmail);
router.get('/suppressed', c.listSuppressed);
router.delete('/suppressed/:email', c.unsuppress);

module.exports = router;
