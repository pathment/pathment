const express = require('express');
const router = express.Router();
const changelogController = require('../controllers/changelogController');
const { authenticate } = require('../middlewares/auth');
const { requirePermission } = require('../middlewares/authz');
const { validateQuery } = require('../middlewares/validate');
const changelogSchemas = require('../validations/changelogValidation');
const { PERMISSIONS } = require('../config/permissions');

// Anyone authenticated reads their own role-filtered "What's New" feed.
router.get('/', authenticate, changelogController.feed);
router.post('/seen', authenticate, changelogController.markSeen);

// Authoring is an org/system action — gated on system.settings (org admins hold it).
router.get('/manage', authenticate, requirePermission(PERMISSIONS.SYSTEM_SETTINGS), validateQuery(changelogSchemas.listQuery), changelogController.listAll);
router.post('/', authenticate, requirePermission(PERMISSIONS.SYSTEM_SETTINGS), changelogController.create);
router.post('/import', authenticate, requirePermission(PERMISSIONS.SYSTEM_SETTINGS), changelogController.importMany);
router.patch('/:id', authenticate, requirePermission(PERMISSIONS.SYSTEM_SETTINGS), changelogController.update);
router.delete('/:id', authenticate, requirePermission(PERMISSIONS.SYSTEM_SETTINGS), changelogController.remove);

module.exports = router;
