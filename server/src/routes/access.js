const express = require('express');
const router = express.Router();
const accessController = require('../controllers/accessController');
const { authenticate } = require('../middlewares/auth');
const { requirePermission } = require('../middlewares/authz');
const { PERMISSIONS } = require('../config/permissions');

router.use(authenticate);

// Any authenticated user can read their own effective permissions (for UI gating).
router.get('/me/permissions', accessController.myPermissions);

// Managing who-can-do-what is itself a permission (access.manage).
router.get('/roles', requirePermission(PERMISSIONS.ACCESS_MANAGE), accessController.getRoleCatalog);
router.get('/directory', requirePermission(PERMISSIONS.ACCESS_MANAGE), accessController.getDirectory);
router.get('/users/:userId', requirePermission(PERMISSIONS.ACCESS_MANAGE), accessController.getUserAccess);
router.post('/grants', requirePermission(PERMISSIONS.ACCESS_MANAGE), accessController.grantRole);
router.delete('/grants/:id', requirePermission(PERMISSIONS.ACCESS_MANAGE), accessController.revokeRole);

// Invite a new person with a pre-assigned role (applied on registration).
router.post('/invites', requirePermission(PERMISSIONS.ACCESS_MANAGE), accessController.inviteWithRole);

// Org-wide audit feed — who did what, when (admins only).
router.get('/audit', requirePermission(PERMISSIONS.ACCESS_MANAGE), accessController.getAuditLogs);

// Custom (admin-defined) roles
router.get('/custom-roles', requirePermission(PERMISSIONS.ACCESS_MANAGE), accessController.listCustomRoles);
router.post('/custom-roles', requirePermission(PERMISSIONS.ACCESS_MANAGE), accessController.createCustomRole);
router.patch('/custom-roles/:id', requirePermission(PERMISSIONS.ACCESS_MANAGE), accessController.updateCustomRole);
router.delete('/custom-roles/:id', requirePermission(PERMISSIONS.ACCESS_MANAGE), accessController.deleteCustomRole);

module.exports = router;
