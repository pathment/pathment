const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/feedbackReportController');
const { authenticate } = require('../middlewares/auth');
const { requirePermissionMinScope } = require('../middlewares/authz');
const { PERMISSIONS } = require('../config/permissions');
const upload = require('../middlewares/upload');

// ── Any authenticated user ───────────────────────────────────────────────────
// Submit feedback / a bug report, with an optional screenshot or short clip.
router.post('/', authenticate, upload.singleSafe('attachment'), ctrl.create);
// The reporter's own submissions + their current status.
router.get('/mine', authenticate, ctrl.listMine);

// ── Admin triage (feedback.manage) ────────────────────────────────────────────
router.get('/', authenticate, requirePermissionMinScope(PERMISSIONS.FEEDBACK_MANAGE), ctrl.listAll);
router.patch('/:id', authenticate, requirePermissionMinScope(PERMISSIONS.FEEDBACK_MANAGE), ctrl.updateStatus);

module.exports = router;
