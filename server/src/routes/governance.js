const express = require('express');
const router = express.Router();
const governanceController = require('../controllers/governanceController');
const { authenticate } = require('../middlewares/auth');
const { requirePermission } = require('../middlewares/authz');
const { PERMISSIONS } = require('../config/permissions');

router.get(
  '/',
  authenticate,
  requirePermission(PERMISSIONS.SYSTEM_SETTINGS),
  governanceController.get
);

router.put(
  '/',
  authenticate,
  requirePermission(PERMISSIONS.SYSTEM_SETTINGS),
  governanceController.update
);

module.exports = router;
