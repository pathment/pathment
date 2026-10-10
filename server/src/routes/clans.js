const express = require('express');
const router = express.Router();
const clanController = require('../controllers/clanController');
const { authenticate, authorize } = require('../middlewares/auth');
const { requirePermission, requireAnyPermission, requireAddClanMember, requirePermissionMinScope, scope } = require('../middlewares/authz');
const { validateQuery, validateBody, validateParams } = require('../middlewares/validate');
const clanSchemas = require('../validations/clanValidation');
const { PERMISSIONS } = require('../config/permissions');

// Current user's clan memberships (any authenticated role).
router.get('/me/memberships', authenticate, clanController.myMemberships);

// Programs the current mentor runs (their clans + roster counts).
router.get('/mentor/programs', authenticate, authorize(['mentor', 'admin']), clanController.mentorPrograms);
// Must sit before '/:id' so 'mentor' is not swallowed as a clan id.
router.get('/mentor/programs/:programId', authenticate, authorize(['mentor', 'admin']), clanController.mentorProgramDetail);

// List clans (any authenticated user; filterable by program/status/search,
// paginated when page/limit are supplied — limit is hard-capped at 100).
router.get('/', authenticate, validateQuery(clanSchemas.listQuery), clanController.listClans);

// Org-wide clan-health snapshot + insights (analytics consumers).
router.get('/follow-ups', authenticate, requirePermissionMinScope(PERMISSIONS.ANALYTICS_VIEW), validateQuery(clanSchemas.followUpQuery), clanController.clanFollowUps);
router.get('/health', authenticate, requirePermissionMinScope(PERMISSIONS.ANALYTICS_VIEW), clanController.clanHealth);
router.get('/insights', authenticate, requirePermissionMinScope(PERMISSIONS.ANALYTICS_VIEW), clanController.clanInsights);

// Photo edits deliberately do not grant membership, program or permission changes.
const avatarService = require('../services/clanAvatarService');
const upload = require('../middlewares/upload');
const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');

/**
 * Standing clan mentee roster + activity (after formal program close)
 */
router.post(
  '/:id/standing-members',
  authenticate,
  validateParams(clanSchemas.idParams),
  validateBody(clanSchemas.standingMembersBody),
  clanController.addStandingMembers
);

router.get(
  '/:id/activity',
  authenticate,
  validateParams(clanSchemas.idParams),
  validateQuery(clanSchemas.standingActivityQuery),
  clanController.getStandingActivity
);

/**
 * What a mentee did before this clan, and the unfinished work a mentor may
 * choose to carry forward. Carrying forward creates NEW assignments here; the
 * originals stay in the completed programme untouched.
 */
router.get(
  '/:id/prior-record',
  authenticate,
  validateParams(clanSchemas.idParams),
  clanController.getStandingPriorRecord
);

router.get(
  '/:id/mentees/:menteeId/unfinished-prior-work',
  authenticate,
  clanController.getUnfinishedPriorWork
);

router.post(
  '/:id/mentees/:menteeId/carry-forward',
  authenticate,
  clanController.carryForwardWork
);

const canEditAvatar = catchAsync(async (req, res, next) => { await avatarService.editableClan(req.params.id, req.user); next(); });

// Crop → upload file → receive URL → save URL (add and change).
router.post(
  '/:id/avatar/upload',
  authenticate,
  validateParams(clanSchemas.idParams),
  canEditAvatar,
  upload.singleSafe('file'),
  catchAsync(async (req, res) => {
    res.status(201).json(
      successResponse('File uploaded', await avatarService.uploadAvatarFile(req.params.id, req.user, req.file), 201)
    );
  })
);
router.put(
  '/:id/avatar',
  authenticate,
  validateParams(clanSchemas.idParams),
  canEditAvatar,
  catchAsync(async (req, res) => {
    res.json(
      successResponse(
        'Clan photo updated',
        await avatarService.setAvatarUrl(req.params.id, req.user, req.body?.avatarUrl)
      )
    );
  })
);
router.delete('/:id/avatar', authenticate, validateParams(clanSchemas.idParams), canEditAvatar, catchAsync(async (req, res) => {
  res.json(successResponse('Clan photo removed', await avatarService.removeAvatar(req.params.id, req.user)));
}));

// Clan detail.
router.get('/:id', authenticate, validateParams(clanSchemas.idParams), clanController.getClan);

// Create a clan - needs clan.create (super_admin, people_admin, or program_admin
// of the target program).
router.post('/', authenticate, requirePermission(PERMISSIONS.CLAN_CREATE, (req) => ({ programId: req.body.programId })), clanController.createClan);

// Update / manage members - needs clan.manage_members ON THIS CLAN. That's held
// by admins and the clan's LEAD MENTOR (not co-mentors). Co-mentors may add
// mentees when they hold mentee.add (see requireAddClanMember below).
router.patch('/:id', authenticate, requirePermission(PERMISSIONS.CLAN_MANAGE_MEMBERS, scope.clan('id')), clanController.updateClan);
router.post('/:id/members', authenticate, requireAddClanMember(scope.clan('id')), clanController.addMember);
router.delete('/:id/members/:userId', authenticate, requirePermission(PERMISSIONS.CLAN_MANAGE_MEMBERS, scope.clan('id')), clanController.removeMember);

// Clan-scoped capabilities for the current mentor (before /:userId routes).
router.get('/:id/members/me/access', authenticate, clanController.getMyClanAccess);

// Fine-tune one co-mentor's permissions (lead mentor of THIS clan, or an admin).
router.get('/:id/members/:userId/permissions', authenticate, requirePermission(PERMISSIONS.CLAN_MANAGE_MEMBERS, scope.clan('id')), clanController.getMemberPermissions);
router.patch('/:id/members/:userId/permissions', authenticate, requirePermission(PERMISSIONS.CLAN_MANAGE_MEMBERS, scope.clan('id')), clanController.setMemberPermissions);

// Reassign a mentee to a different clan (cross-clan admin action).
router.post('/reassign', authenticate, requirePermissionMinScope(PERMISSIONS.CLAN_MANAGE_MEMBERS, 'program'), clanController.reassignClan);

// Bulk public-join access (must be before /:id routes).
router.post(
  '/public-join/bulk-access',
  authenticate,
  requirePermissionMinScope(PERMISSIONS.CLAN_MANAGE_MEMBERS, 'program'),
  validateBody(clanSchemas.bulkPublicJoinAccess),
  clanController.bulkSetPublicJoinAccess
);

// Lead mentor: pull in unassigned mentees, or invite a new one straight into the clan.
router.get('/:id/available', authenticate, requireAnyPermission([PERMISSIONS.CLAN_MANAGE_MEMBERS, PERMISSIONS.MENTEE_ADD], scope.clan('id')), clanController.availableMembers);
router.post('/:id/invite', authenticate, requireAnyPermission([PERMISSIONS.CLAN_MANAGE_MEMBERS, PERMISSIONS.MENTEE_ADD], scope.clan('id')), clanController.inviteToClan);

// The invites into this clan, and the two things left to do to one. Guarded on
// the same pair as sending one: whoever may invite into a clan may see what
// they invited. Listing invites otherwise lives behind invite.create, which a
// lead mentor does not hold, so an invite went out and nothing could be learned
// about it afterwards.
router.get('/:id/invites', authenticate, requireAnyPermission([PERMISSIONS.CLAN_MANAGE_MEMBERS, PERMISSIONS.MENTEE_ADD], scope.clan('id')), clanController.listClanInvites);
router.post('/:id/invites/:inviteId/resend', authenticate, requireAnyPermission([PERMISSIONS.CLAN_MANAGE_MEMBERS, PERMISSIONS.MENTEE_ADD], scope.clan('id')), clanController.resendClanInvite);
router.post('/:id/invites/:inviteId/revoke', authenticate, requireAnyPermission([PERMISSIONS.CLAN_MANAGE_MEMBERS, PERMISSIONS.MENTEE_ADD], scope.clan('id')), clanController.revokeClanInvite);

// ── Public clan joining link (admin access + lead link + join requests) ─────
// Service layer enforces: admin-only for access; current Lead Mentor for link /
// approve/reject. Route-level gates keep anonymous callers out.
router.get(
  '/:id/public-join',
  authenticate,
  validateParams(clanSchemas.idParams),
  clanController.getPublicJoinState
);
router.patch(
  '/:id/public-join/access',
  authenticate,
  requirePermissionMinScope(PERMISSIONS.CLAN_MANAGE_MEMBERS, 'program'),
  validateParams(clanSchemas.idParams),
  validateBody(clanSchemas.publicJoinAccess),
  clanController.setPublicJoinAccess
);
router.post(
  '/:id/public-join/link',
  authenticate,
  validateParams(clanSchemas.idParams),
  validateBody(clanSchemas.publicJoinLinkBody),
  clanController.generatePublicJoinLink
);
router.delete(
  '/:id/public-join/link',
  authenticate,
  validateParams(clanSchemas.idParams),
  clanController.disablePublicJoinLink
);
router.post(
  '/:id/public-join/regenerate',
  authenticate,
  validateParams(clanSchemas.idParams),
  validateBody(clanSchemas.publicJoinLinkBody),
  clanController.regeneratePublicJoinLink
);
router.get(
  '/:id/join-requests',
  authenticate,
  validateParams(clanSchemas.idParams),
  validateQuery(clanSchemas.joinRequestQuery),
  clanController.listJoinRequests
);
router.post(
  '/:id/join-requests/:requestId/approve',
  authenticate,
  validateParams(clanSchemas.joinRequestParams),
  clanController.approveJoinRequest
);
router.post(
  '/:id/join-requests/:requestId/reject',
  authenticate,
  validateParams(clanSchemas.joinRequestParams),
  validateBody(clanSchemas.rejectJoinRequest),
  clanController.rejectJoinRequest
);

// Candidates for co-mentor / core-team (anyone active, not already in the clan).
router.get('/:id/candidates', authenticate, requirePermission(PERMISSIONS.CLAN_MANAGE_MEMBERS, scope.clan('id')), clanController.candidates);

// Delegate / revoke custom clan-scoped permissions within this clan (lead mentor or admin).
router.post('/:id/grants', authenticate, requirePermission(PERMISSIONS.CLAN_MANAGE_MEMBERS, scope.clan('id')), clanController.grantClanRole);
router.delete('/:id/grants/:assignmentId', authenticate, requirePermission(PERMISSIONS.CLAN_MANAGE_MEMBERS, scope.clan('id')), clanController.revokeClanRole);

module.exports = router;
