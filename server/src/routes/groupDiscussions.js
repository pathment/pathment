const express = require('express');
const router = express.Router();
const c = require('../controllers/groupDiscussionController');
const { authenticate, authorize } = require('../middlewares/auth');

const mentorOnly = [authenticate, authorize(['mentor', 'admin'])];

// A mentee's own groups. Declared first so 'mine' can never be read as an id.
router.get('/mine', authenticate, c.mine);
router.get('/mine/:id', authenticate, c.mineOne);
router.get('/mine/:id/members', authenticate, c.mineMembers);

router.get('/', mentorOnly, c.list);
router.post('/scenarios', mentorOnly, c.createScenario);
router.patch('/scenarios/:id', mentorOnly, c.updateScenario);
router.delete('/scenarios/:id', mentorOnly, c.deleteScenario);

router.post('/groups', mentorOnly, c.createGroup);
router.get('/groups/:id', mentorOnly, c.getGroup);
router.patch('/groups/:id', mentorOnly, c.updateGroup);
router.delete('/groups/:id', mentorOnly, c.deleteGroup);
router.post('/groups/:id/members', mentorOnly, c.addMembers);
router.delete('/groups/:id/members/:menteeId', mentorOnly, c.removeMember);
router.get('/tasks/:taskId/participation', mentorOnly, c.taskParticipation);

module.exports = router;
