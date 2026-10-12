const express = require('express');
const router = express.Router();
const c = require('../controllers/talksController');
const { authenticate } = require('../middlewares/auth');
const { requirePermissionAnyScope } = require('../middlewares/authz');
const { PERMISSIONS } = require('../config/permissions');

// Reading is open to any authenticated user; the Talks page is only linked for mentors and admins.
router.get('/', authenticate, c.list);
router.get('/categories', authenticate, c.listCategories);
router.get('/:id', authenticate, c.getOne);

// Mentors and admins hold library.manage. Edit/delete is further limited to the uploader or an admin.
const canContribute = requirePermissionAnyScope(PERMISSIONS.LIBRARY_MANAGE);
router.post('/', authenticate, canContribute, c.create);
router.patch('/:id', authenticate, canContribute, c.update);
router.delete('/:id', authenticate, canContribute, c.remove);

const canManageCategories = requirePermissionAnyScope(PERMISSIONS.SYSTEM_SETTINGS);
router.post('/categories', authenticate, canManageCategories, c.createCategory);
router.patch('/categories/:id', authenticate, canManageCategories, c.updateCategory);
router.delete('/categories/:id', authenticate, canManageCategories, c.removeCategory);

module.exports = router;
