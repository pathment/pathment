const express = require('express');
const router = express.Router();
const c = require('../controllers/aiConnectionController');
const { authenticate, authorize } = require('../middlewares/auth');

// Admins manage org-wide connections; mentors manage their personal ones.
// Scope is derived from the user in the service, so the same routes serve both.
router.use(authenticate, authorize(['admin', 'mentor']));

router.get('/', c.list);
router.post('/', c.create);
router.delete('/:id', c.remove);
router.post('/:id/test', c.test);
router.put('/routing', c.setRouting);

module.exports = router;
