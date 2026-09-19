const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const clanService = require('../services/clanService');
const clanPublicJoinService = require('../services/clanPublicJoinService');
const clanHealthService = require('../services/clanHealthService');
const authzService = require('../services/authzService');
const { PERMISSIONS } = require('../config/permissions');
const { ValidationError, NotFoundError } = require('../utils/errors/errorTypes');

/**
 * GET /api/clans/health  (admin)
 * Org-wide clan-health snapshot grouped by program for the admin dashboard.
 */
const clanHealth = catchAsync(async (req, res) => {
  const health = await clanHealthService.programHealth();
  res.status(200).json(successResponse('Clan health retrieved', health));
});

/**
 * GET /api/clans/insights  (admin)
 * Worst-first clan comparison + the org fairness lens (absolute vs relative).
 */
const clanInsights = catchAsync(async (req, res) => {
  const insights = await clanHealthService.orgInsights();
  res.status(200).json(successResponse('Clan insights retrieved', insights));
});

/**
 * GET /api/clans
 * List clans (optionally filtered by program/status).
 */
const listClans = catchAsync(async (req, res) => {
  const { programId, status, search, page, limit } = req.query;
  // A program_admin sees only their programs' clans (org admins: all).
  const programScope = await authzService.adminProgramScope(req.user, {
    assignments: req.loadAssignments ? await req.loadAssignments() : undefined
  });
  const filters = { programId, status, search };
  if (Array.isArray(programScope) && programScope.length) filters.programIds = programScope;

  // Paginated when the caller asks for a page/limit; otherwise the full
  // (program-scoped, runaway-guarded) list for dropdowns/pickers.
  if (page !== undefined || limit !== undefined) {
    filters.page = page;
    filters.limit = limit ?? 20;
    const result = await clanService.listClans(filters);
    return res.status(200).json(successResponse('Clans retrieved', result));
  }
  const clans = await clanService.listClans(filters);
  res.status(200).json(successResponse('Clans retrieved', { clans }));
});

/**
 * GET /api/clans/me/memberships
 * The current user's active clan memberships (across roles).
 */
const myMemberships = catchAsync(async (req, res) => {
  const memberships = await clanService.getMembershipsForUser(req.user.id);
  res.status(200).json(successResponse('Memberships retrieved', { memberships }));
});

/**
 * GET /api/clans/mentor/programs
 * Programs the current mentor runs, each with their clans + roster counts.
 */
const mentorPrograms = catchAsync(async (req, res) => {
  const programs = await clanService.getMentorPrograms(req.user.id);
  res.status(200).json(successResponse('Mentor programs retrieved', { programs }));
});

/**
 * GET /api/clans/mentor/programs/:programId
 * One program the mentor runs, with each of their clans' full rosters — so the
 * program page needs a single request rather than one per clan.
 */
const mentorProgramDetail = catchAsync(async (req, res) => {
  const detail = await clanService.getMentorProgramDetail(req.user.id, req.params.programId);
  if (!detail) throw new NotFoundError('Program not found');
  res.status(200).json(successResponse('Mentor program retrieved', detail));
});

/**
 * GET /api/clans/:id
 */
const getClan = catchAsync(async (req, res) => {
  const clan = await clanService.getClanById(req.params.id);
  res.status(200).json(successResponse('Clan retrieved', { clan }));
});

/**
 * POST /api/clans  (admin)
 */
const createClan = catchAsync(async (req, res) => {
  const clan = await clanService.createClan(req.body, req.user.id);
  res.status(201).json(successResponse('Clan created', { clan }, 201));
});

/**
 * PATCH /api/clans/:id  (admin / lead mentor)
 */
const updateClan = catchAsync(async (req, res) => {
  const clan = await clanService.updateClan(req.params.id, req.body);
  res.status(200).json(successResponse('Clan updated', { clan }));
});

/**
 * POST /api/clans/:id/members  (admin / lead mentor)
 * Assign a user to the clan with a clan-scoped role (clan-based assignment).
 */
const addMember = catchAsync(async (req, res) => {
  const membership = await clanService.addMember(req.params.id, req.body, req.user);
  res.status(201).json(successResponse('Member added', { membership }, 201));
});

/**
 * GET /api/clans/:id/members/me/access  (lead / co-mentor of this clan)
 * Clan-scoped capabilities for the current user — drives the clan-team UI.
 */
const getMyClanAccess = catchAsync(async (req, res) => {
  const access = await clanService.getMyClanAccess(req.params.id, req.user);
  res.status(200).json(successResponse('Clan access retrieved', access));
});

/**
 * DELETE /api/clans/:id/members/:userId  (admin / lead mentor)
 * `?role=` removes just that clan role — a member who is both a mentee and a
 * co-mentor here keeps the other one. Omit it to evict them from the clan.
 */
const removeMember = catchAsync(async (req, res) => {
  const membership = await clanService.removeMember(req.params.id, req.params.userId, req.query.role || null);
  res.status(200).json(successResponse('Member removed', { membership }));
});

/**
 * GET /api/clans/:id/members/:userId/permissions  (admin / lead mentor)
 * The toggle state for one co-mentor: the full key list + which are revoked.
 */
const getMemberPermissions = catchAsync(async (req, res) => {
  const result = await clanService.getMemberPermissions(req.params.id, req.params.userId);
  res.status(200).json(successResponse('Permissions retrieved', result));
});

/**
 * PATCH /api/clans/:id/members/:userId/permissions  (admin / lead mentor)
 * Fine-tune one co-mentor's permissions. Body: { denied: ['perm', …] } — the
 * subset of the co-mentor defaults to revoke for this person (empty = full
 * parity). Works for co-mentors from any source. Guarded by clan.manage_members,
 * so co-mentors can't reach it.
 */
const setMemberPermissions = catchAsync(async (req, res) => {
  const result = await clanService.setMemberPermissions(
    req.params.id, req.params.userId, req.body.denied, req.user.id
  );
  res.status(200).json(successResponse('Permissions updated', result));
});

/**
 * GET /api/clans/:id/available  (admin / lead mentor of the clan)
 * People who can be placed in THIS clan as a mentee. Anyone already a mentee
 * of another clan comes back annotated (so the picker can add them here too).
 * `includePlaced` only gates platform admins, not other-clan mentees.
 */
const availableMembers = catchAsync(async (req, res) => {
  const canReassign = await authzService.canAtMinScope(req.user, PERMISSIONS.CLAN_MANAGE_MEMBERS, 'program');
  const people = await clanService.listAvailableMembers({
    q: req.query.q, clanId: req.params.id, includePlaced: canReassign,
  });
  res.status(200).json(successResponse('Available members', { people, canReassign }));
});

/**
 * GET /api/clans/:id/candidates  (admin / lead mentor of the clan)
 * Anyone (mentor OR mentee) not already in this clan — the consistent picker for
 * adding a co-mentor / core-team member.
 */
const candidates = catchAsync(async (req, res) => {
  const people = await clanService.listCandidates(req.params.id, { q: req.query.q });
  res.status(200).json(successResponse('Candidates', { people }));
});

/**
 * POST /api/clans/:id/grants  (admin / lead mentor of the clan)
 * Delegate a CLAN-SCOPED role (built-in co_mentor/core_team or a custom clan
 * role) to a user — i.e. give them custom permissions inside this clan. Guarded
 * against privilege escalation (you can't grant more than you hold here).
 */
const grantClanRole = catchAsync(async (req, res) => {
  const accessService = require('../services/accessService');
  const assignment = await accessService.grantScopedRoleAsDelegate(
    { userId: req.body.userId, role: req.body.role, scopeType: 'clan', scopeId: req.params.id },
    req.user
  );
  res.status(201).json(successResponse('Permission granted', { assignment }, 201));
});

/**
 * DELETE /api/clans/:id/grants/:assignmentId  (admin / lead mentor of the clan)
 * Revoke a clan-scoped grant made on this clan.
 */
const revokeClanRole = catchAsync(async (req, res) => {
  const accessService = require('../services/accessService');
  await accessService.revokeClanGrant(req.params.assignmentId, req.params.id, req.user.id);
  res.status(200).json(successResponse('Permission revoked', { revoked: true }));
});

/**
 * POST /api/clans/reassign  (admin / people-admin / program-admin)
 * Move a mentee to a different clan, cleaning up their previous placement.
 * Same program → keeps the enrollment; different program → wipes it (clean
 * transfer). A program_admin may only move within programs they administer.
 */
const reassignClan = catchAsync(async (req, res) => {
  const { menteeId, toClanId } = req.body;
  if (!menteeId || !toClanId) throw new ValidationError('menteeId and toClanId are required');

  const assignments = req.loadAssignments ? await req.loadAssignments() : undefined;
  // Target + every current clan the mentee is in must be within the admin's scope.
  const toScope = await authzService.scopeOfClan(toClanId);
  await authzService.assertProgramInScope(req.user, toScope && toScope.programId, { assignments });
  const memberships = await clanService.getMembershipsForUser(menteeId);
  for (const m of memberships) {
    if (m.role === 'mentee' && m.status === 'active' && m.clan && m.clan.programId) {
      await authzService.assertProgramInScope(req.user, m.clan.programId, { assignments });
    }
  }

  const result = await clanService.reassignMentee(menteeId, toClanId, req.user.id);
  res.status(200).json(successResponse('Mentee reassigned', result));
});

/**
 * POST /api/clans/:id/invite  (admin / lead mentor of the clan)
 * Invite a new person straight into this clan as a mentee.
 */
const inviteToClan = catchAsync(async (req, res) => {
  const invite = await clanService.inviteToClan(req.params.id, req.body.email, req.user.id);
  res.status(201).json(successResponse('Invite sent', { invite }, 201));
});

/**
 * GET /api/clans/:id/public-join  (admin / lead mentor)
 * Public-join settings for this clan (allowed/enabled/link URL).
 */
const getPublicJoinState = catchAsync(async (req, res) => {
  const state = await clanPublicJoinService.getPublicJoinState(req.params.id, req.user);
  res.status(200).json(successResponse('Public join state retrieved', state));
});

/**
 * PATCH /api/clans/:id/public-join/access  (admin)
 * Grant or revoke per-clan public-join permission (default off).
 */
const setPublicJoinAccess = catchAsync(async (req, res) => {
  const state = await clanPublicJoinService.setPublicJoinAccess(
    req.params.id,
    req.body,
    req.user
  );
  res.status(200).json(successResponse(
    req.body.allowed ? 'Public joining access granted' : 'Public joining access removed',
    state
  ));
});

/**
 * POST /api/clans/public-join/bulk-access  (admin)
 * Grant or revoke public-join permission for multiple clans.
 */
const bulkSetPublicJoinAccess = catchAsync(async (req, res) => {
  const result = await clanPublicJoinService.bulkSetPublicJoinAccess(req.body, req.user);
  res.status(200).json(successResponse(
    req.body.allowed
      ? `Public joining access granted for ${result.updated} clan${result.updated === 1 ? '' : 's'}`
      : `Public joining access removed for ${result.updated} clan${result.updated === 1 ? '' : 's'}`,
    result
  ));
});

/**
 * POST /api/clans/:id/public-join/link  (lead mentor)
 * Mint or re-enable the shareable joining link (optional join window in body).
 */
const generatePublicJoinLink = catchAsync(async (req, res) => {
  const state = await clanPublicJoinService.generateOrEnableLink(req.params.id, req.user, req.body);
  res.status(200).json(successResponse('Public joining link ready', state));
});

/**
 * DELETE /api/clans/:id/public-join/link  (lead mentor)
 * Disable the link without discarding the slug.
 */
const disablePublicJoinLink = catchAsync(async (req, res) => {
  const state = await clanPublicJoinService.disableLink(req.params.id, req.user);
  res.status(200).json(successResponse('Public joining link disabled', state));
});

/**
 * POST /api/clans/:id/public-join/regenerate  (lead mentor)
 * Replace the slug so old URLs stop working (optional join window in body).
 */
const regeneratePublicJoinLink = catchAsync(async (req, res) => {
  const state = await clanPublicJoinService.regenerateLink(req.params.id, req.user, req.body);
  res.status(200).json(successResponse('Public joining link regenerated', state));
});

/**
 * GET /api/clans/:id/join-requests  (lead mentor)
 * List public-link join requests for this clan.
 */
const listJoinRequests = catchAsync(async (req, res) => {
  const requests = await clanPublicJoinService.listJoinRequests(req.params.id, req.user, {
    status: req.query.status
  });
  res.status(200).json(successResponse('Join requests retrieved', { requests }));
});

/**
 * POST /api/clans/:id/join-requests/:requestId/approve  (lead mentor)
 * Approve a pending request and place the mentee via clanService.addMember.
 */
const approveJoinRequest = catchAsync(async (req, res) => {
  const result = await clanPublicJoinService.approveJoinRequest(
    req.params.id,
    req.params.requestId,
    req.user
  );
  res.status(200).json(successResponse('Join request approved', result));
});

/**
 * POST /api/clans/:id/join-requests/:requestId/reject  (lead mentor)
 * Reject a pending request (optional note).
 */
const rejectJoinRequest = catchAsync(async (req, res) => {
  const request = await clanPublicJoinService.rejectJoinRequest(
    req.params.id,
    req.params.requestId,
    req.user,
    { note: req.body?.note }
  );
  res.status(200).json(successResponse('Join request rejected', { request }));
});

/**
 * GET /api/public/clans/join/:token  (public; optional auth)
 * Clan preview + viewer status for the public joining page.
 */
const getPublicClanJoin = catchAsync(async (req, res) => {
  const info = await clanPublicJoinService.getPublicClanInfo(
    req.params.token,
    req.user?.id || null
  );
  res.status(200).json(successResponse('Clan joining info retrieved', info));
});

/**
 * POST /api/public/clans/join/:token/request  (authenticated)
 * Submit a join request via the public link.
 */
const submitPublicJoinRequest = catchAsync(async (req, res) => {
  const request = await clanPublicJoinService.createJoinRequest(
    req.params.token,
    req.user,
    { message: req.body?.message }
  );
  res.status(201).json(successResponse('Join request submitted', { request }, 201));
});

/**
 * GET /api/clans/:id/invites  (admin / lead mentor of the clan)
 *
 * Every invite into THIS clan, whoever sent it. A lead mentor could create one
 * through POST /clans/:id/invite and then had no way to see it: listing invites
 * lived behind invite.create, which a mentor does not hold. So an invite went
 * out and whether it landed, lapsed or was already used was unanswerable
 * without an admin.
 *
 * Scoped by clan rather than by who sent it, because the clan is what a lead
 * mentor is responsible for. An invite an admin placed into their clan is still
 * theirs to chase.
 */
const listClanInvites = catchAsync(async (req, res) => {
  const adminService = require('../services/adminService');
  const result = await adminService.listRegistrationInvites({
    clanId: req.params.id,
    status: req.query.status || 'all',
    limit: req.query.limit,
    offset: req.query.offset
  });

  res.status(200).json(successResponse('Clan invites retrieved', result));
});

/**
 * The invite named in the path, once it is confirmed to belong to this clan.
 *
 * Without the check an id is all it takes to act on another clan's invite, and
 * the guard on these routes only proves the caller runs the clan in the path.
 */
async function inviteInClan(inviteId, clanId) {
  const { models } = require('../db');
  const invite = await models.RegistrationInvite.findByPk(inviteId);

  if (!invite || invite.clanId !== clanId) {
    throw new NotFoundError('Invite not found for this clan');
  }

  return invite;
}

/** POST /api/clans/:id/invites/:inviteId/resend  (admin / lead mentor of the clan) */
const resendClanInvite = catchAsync(async (req, res) => {
  await inviteInClan(req.params.inviteId, req.params.id);

  const adminService = require('../services/adminService');
  const invite = await adminService.resendRegistrationInvite(req.params.inviteId, req.user.id, {});

  res.status(200).json(successResponse('Invite sent again', { invite }));
});

/** POST /api/clans/:id/invites/:inviteId/revoke  (admin / lead mentor of the clan) */
const revokeClanInvite = catchAsync(async (req, res) => {
  await inviteInClan(req.params.inviteId, req.params.id);

  const adminService = require('../services/adminService');
  const invite = await adminService.revokeRegistrationInvite(req.params.inviteId, req.user.id);

  res.status(200).json(successResponse('Invite pulled', { invite }));
});

module.exports = {
  listClanInvites,
  resendClanInvite,
  revokeClanInvite,
  listClans,
  clanHealth,
  clanInsights,
  myMemberships,
  mentorPrograms,
  mentorProgramDetail,
  getClan,
  createClan,
  updateClan,
  addMember,
  getMyClanAccess,
  removeMember,
  getMemberPermissions,
  setMemberPermissions,
  availableMembers,
  candidates,
  reassignClan,
  grantClanRole,
  revokeClanRole,
  inviteToClan,
  getPublicJoinState,
  setPublicJoinAccess,
  bulkSetPublicJoinAccess,
  generatePublicJoinLink,
  disablePublicJoinLink,
  regeneratePublicJoinLink,
  listJoinRequests,
  approveJoinRequest,
  rejectJoinRequest,
  getPublicClanJoin,
  submitPublicJoinRequest
};
