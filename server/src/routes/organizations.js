const express = require('express');
const controller = require('../controllers/organizationController');
const { authenticate, authenticateAccount } = require('../middlewares/auth');
const upload = require('../middlewares/upload');

const { workspaceCreationLimiter } = require('../middlewares/rateLimiter');
const router = express.Router();
router.get('/plans', controller.listPlans);
router.post('/', authenticateAccount, workspaceCreationLimiter, controller.create);
router.get('/me', authenticateAccount, controller.listMine);
router.use(authenticate);
router.get('/current', controller.current);
router.get('/demo', controller.demo);
router.patch('/current', controller.updateCurrent);
router.post('/current/logo', upload.singleSafe('file'), controller.uploadLogo);
router.delete('/current/logo', controller.removeLogo);
router.post('/current/plan-request', controller.requestPlan);

module.exports = router;
