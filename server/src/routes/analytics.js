const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { authenticate, authorize } = require('../middlewares/auth');

router.get(
  '/overview',
  authenticate,
  authorize('admin'),
  analyticsController.getOverview
);

router.get(
  '/programs',
  authenticate,
  authorize('admin'),
  analyticsController.getProgramsList
);

router.get(
  '/mentors',
  authenticate,
  authorize('admin'),
  analyticsController.getMentorsList
);

module.exports = router;
