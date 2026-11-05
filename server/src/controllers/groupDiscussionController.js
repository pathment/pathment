const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const service = require('../services/groupDiscussionService');
const meetings = require('../services/discussionMeetingService');

/** GET /api/group-discussions?clanId= — scenarios with their groups. */
const list = catchAsync(async (req, res) => {
  const result = await service.listForMentor(req.user.id, req.query.clanId || null);
  res.status(200).json(successResponse('Group discussions', result));
});

/** POST /api/group-discussions/scenarios  { clanId, title, prompt? } */
const createScenario = catchAsync(async (req, res) => {
  const scenario = await service.createScenario(req.user.id, req.body || {});
  res.status(201).json(successResponse('Scenario created', { scenario }, 201));
});

const updateScenario = catchAsync(async (req, res) => {
  const scenario = await service.updateScenario(req.user.id, req.params.id, req.body || {});
  res.status(200).json(successResponse('Scenario saved', { scenario }));
});

const deleteScenario = catchAsync(async (req, res) => {
  await service.deleteScenario(req.user.id, req.params.id);
  res.status(200).json(successResponse('Scenario deleted', {}));
});

/** POST /api/group-discussions/groups  { scenarioId, name, menteeIds?, schedule? } */
const createGroup = catchAsync(async (req, res) => {
  const group = await service.createGroup(req.user.id, req.body || {});
  res.status(201).json(successResponse('Group discussion created', { group }, 201));
});

const getGroup = catchAsync(async (req, res) => {
  const group = await service.getForMentor(req.user.id, req.params.id);
  res.status(200).json(successResponse('Group discussion', { group }));
});

const updateGroup = catchAsync(async (req, res) => {
  const group = await service.updateGroup(req.user.id, req.params.id, req.body || {});
  res.status(200).json(successResponse('Group discussion saved', { group }));
});

const deleteGroup = catchAsync(async (req, res) => {
  await service.deleteGroup(req.user.id, req.params.id);
  res.status(200).json(successResponse('Group discussion deleted', {}));
});

/** POST /api/group-discussions/groups/:id/members  { menteeIds: [...] } */
const addMembers = catchAsync(async (req, res) => {
  const group = await service.addMembers(req.user.id, req.params.id, req.body?.menteeIds);
  res.status(200).json(successResponse('Added to the group', { group }));
});

const removeMember = catchAsync(async (req, res) => {
  const group = await service.removeMember(req.user.id, req.params.id, req.params.menteeId);
  res.status(200).json(successResponse('Removed from the group', { group }));
});

/** GET /api/group-discussions/mine — the groups this mentee is in. */
const mine = catchAsync(async (req, res) => {
  const groups = await service.listForMentee(req.user.id);
  res.status(200).json(successResponse('My group discussions', { groups }));
});

const mineOne = catchAsync(async (req, res) => {
  const group = await service.getForMentee(req.user.id, req.params.id);
  res.status(200).json(successResponse('Group discussion', { group }));
});

/** GET /api/group-discussions/tasks/:taskId/participation — how a mentee took part, for their mentor. */
const taskParticipation = catchAsync(async (req, res) => {
  const participation = await service.participationForTask(req.user.id, req.params.taskId);
  res.status(200).json(successResponse('Participation', { participation }));
});

/** GET /api/group-discussions/mine/:id/members — who is in the chat, for anyone in it. */
const mineMembers = catchAsync(async (req, res) => {
  const members = await service.membersFor(req.user.id, req.params.id);
  res.status(200).json(successResponse('Group members', { members }));
});

// ── the group's live meeting (discussionMeetingService) ─────────────────────

/** PUT /api/group-discussions/groups/:id/meeting  { startsAt, endsAt? } — create or move it. */
const scheduleMeeting = catchAsync(async (req, res) => {
  const view = await meetings.scheduleMeeting(req.user.id, req.params.id, req.body || {});
  res.status(200).json(successResponse('Meeting scheduled', view));
});

const cancelMeeting = catchAsync(async (req, res) => {
  const result = await meetings.cancelMeeting(req.user.id, req.params.id);
  res.status(200).json(successResponse('Meeting cancelled', result));
});

/** GET /api/group-discussions/groups/:id/meeting — the host's panel. */
const meetingHostView = catchAsync(async (req, res) => {
  const view = await meetings.hostView(req.user.id, req.params.id);
  res.status(200).json(successResponse('Meeting', view));
});

const startMeeting = catchAsync(async (req, res) => {
  const join = await meetings.startMeeting(req.user.id, req.params.id);
  res.status(200).json(successResponse('Meeting started', { join }));
});

/** POST .../meeting/end — returns the post-meeting summary. */
const endMeeting = catchAsync(async (req, res) => {
  const summary = await meetings.endMeeting(req.user.id, req.params.id);
  res.status(200).json(successResponse('Meeting ended', { summary }));
});

/** POST .../meeting/talk-time  { items: [{ menteeId, seconds }] } */
const recordMeetingTalk = catchAsync(async (req, res) => {
  const result = await meetings.recordTalkTime(req.user.id, req.params.id, req.body?.items);
  res.status(200).json(successResponse('Talk time recorded', result));
});

const meetingSummary = catchAsync(async (req, res) => {
  const summary = await meetings.summary(req.user.id, req.params.id);
  res.status(200).json(successResponse('Meeting summary', { summary }));
});

/** PUT /api/group-discussions/groups/:id/feedback/:menteeId  { communication, ..., note } */
const saveFeedback = catchAsync(async (req, res) => {
  const feedback = await meetings.saveFeedback(req.user.id, req.params.id, req.params.menteeId, req.body || {});
  res.status(200).json(successResponse('Feedback saved', { feedback }));
});

/** GET /api/group-discussions/meetings/upcoming — live or soon, for the Join banner. */
const upcomingMeetings = catchAsync(async (req, res) => {
  const list = await meetings.upcomingForUser(req.user.id);
  res.status(200).json(successResponse('Upcoming meetings', { meetings: list }));
});

const myMeetingJoin = catchAsync(async (req, res) => {
  const join = await meetings.joinInfo(req.user.id, req.params.id);
  res.status(200).json(successResponse('Join meeting', { join }));
});

/** POST /api/group-discussions/mine/:id/meeting/join  { talkSeconds } — on join and as the heartbeat. */
const myMeetingPresent = catchAsync(async (req, res) => {
  const result = await meetings.selfJoin(req.user.id, req.params.id, { talkSeconds: req.body?.talkSeconds });
  res.status(200).json(successResponse('Present', result));
});

const myMeetingLeave = catchAsync(async (req, res) => {
  const result = await meetings.selfLeave(req.user.id, req.params.id, req.body?.seconds);
  res.status(200).json(successResponse('Left', result));
});

/** GET /api/group-discussions/mine/:id/result — the mentee's own speaking time, participation and feedback. */
const myResult = catchAsync(async (req, res) => {
  const result = await meetings.myResult(req.user.id, req.params.id);
  res.status(200).json(successResponse('My result', { result }));
});

module.exports = {
  list, createScenario, updateScenario, deleteScenario, createGroup, getGroup, updateGroup, deleteGroup, addMembers, removeMember, mine, mineOne, mineMembers, taskParticipation,
  scheduleMeeting, cancelMeeting, meetingHostView, startMeeting, endMeeting, recordMeetingTalk, meetingSummary, saveFeedback,
  upcomingMeetings, myMeetingJoin, myMeetingPresent, myMeetingLeave, myResult,
};
