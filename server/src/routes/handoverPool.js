const express = require('express');
const router = express.Router();
const handoverPoolController = require('../controllers/handoverPoolController');
const { authenticate, authorize } = require('../middlewares/auth');

/**
 * The handover pool — mentees offered from one clan to any other.
 *
 * Mentors and admins share these routes. Every one of them resolves what the
 * caller may see and do inside the service, from their own clans and programme
 * scope, so there is no separate admin surface to keep in step and a programme
 * admin is correct without a third code path.
 *
 * `mentee.transfer` is the permission throughout, checked per clan at the point
 * of use rather than by middleware here: a push is authorised against the clan
 * being pushed FROM and a claim against the clan being pulled INTO, and route
 * middleware cannot see either until the body is read.
 */
const mentorOrAdmin = [authenticate, authorize(['mentor', 'admin'])];

router.get('/', mentorOrAdmin, handoverPoolController.list);
router.get('/overview', mentorOrAdmin, handoverPoolController.overview);
router.get('/claimable-clans', mentorOrAdmin, handoverPoolController.claimableClans);
router.get('/:entryId/profile', mentorOrAdmin, handoverPoolController.profile);

router.post('/push', mentorOrAdmin, handoverPoolController.push);
router.post('/push-clan', mentorOrAdmin, handoverPoolController.pushClan);
// A chosen set rather than a whole clan; items may span clans.
router.post('/push-many', mentorOrAdmin, handoverPoolController.pushMany);
router.post('/:entryId/claim', mentorOrAdmin, handoverPoolController.claim);
router.post('/:entryId/withdraw', mentorOrAdmin, handoverPoolController.withdraw);

module.exports = router;
