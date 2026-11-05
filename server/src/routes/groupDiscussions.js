const express = require('express');
const router = express.Router();
const c = require('../controllers/groupDiscussionController');
const { authenticate, authorize } = require('../middlewares/auth');

const mentorOnly = [authenticate, authorize(['mentor', 'admin'])];

// A mentee's own groups. Declared first so 'mine' can never be read as an id.
router.get('/mine', authenticate, c.mine);
router.get('/mine/:id', authenticate, c.mineOne);
router.get('/mine/:id/members', authenticate, c.mineMembers);
router.get('/mine/:id/meeting', authenticate, c.myMeetingJoin);
router.post('/mine/:id/meeting/join', authenticate, c.myMeetingPresent);
router.post('/mine/:id/meeting/leave', authenticate, c.myMeetingLeave);
router.get('/mine/:id/result', authenticate, c.myResult);
// Live or about to start, as a mentee of the group or a mentor of its clan.
router.get('/meetings/upcoming', authenticate, c.upcomingMeetings);

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

// The group's live meeting, and the mentor's feedback on each mentee.
router.get('/groups/:id/meeting', mentorOnly, c.meetingHostView);
router.put('/groups/:id/meeting', mentorOnly, c.scheduleMeeting);
router.delete('/groups/:id/meeting', mentorOnly, c.cancelMeeting);
router.post('/groups/:id/meeting/start', mentorOnly, c.startMeeting);
router.post('/groups/:id/meeting/end', mentorOnly, c.endMeeting);
router.post('/groups/:id/meeting/talk-time', mentorOnly, c.recordMeetingTalk);
router.get('/groups/:id/meeting/summary', mentorOnly, c.meetingSummary);
router.put('/groups/:id/feedback/:menteeId', mentorOnly, c.saveFeedback);

module.exports = router;
