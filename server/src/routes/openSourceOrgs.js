const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/openSourceOrgController');
const { authenticate, authorize } = require('../middlewares/auth');

router.get('/', authenticate, authorize(['mentor', 'admin']), ctrl.list);
router.get('/github-search', authenticate, authorize(['mentor', 'admin']), ctrl.searchGithub);
router.post('/', authenticate, authorize(['mentor', 'admin']), ctrl.create);


module.exports = router;
