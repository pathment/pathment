const express = require('express');
const router = express.Router();
const clanController = require('../controllers/clanController');
const { authenticate, authorize } = require('../middlewares/auth');
const { requirePermission, requirePermissionMinScope, scope } = require('../middlewares/authz');
const { validateQuery } = require('../middlewares/validate');
const clanSchemas = require('../validations/clanValidation');
const { PERMISSIONS } = require('../config/permissions');

// Current user's clan memberships (any authenticated role).
router.get('/me/memberships', authenticate, clanController.myMemberships);

// Programs the current mentor runs (their clans + roster counts).
router.get('/mentor/programs', authenticate, authorize(['mentor', 'admin']), clanController.mentorPrograms);

// List clans (any authenticated user; filterable by program/status/search,
// paginated when page/limit are supplied — limit is hard-capped at 100).
router.get('/', authenticate, validateQuery(clanSchemas.listQuery), clanController.listClans);

// Org-wide clan-health snapshot + insights (analytics consumers).
router.get('/health', authenticate, requirePermissionMinScope(PERMISSIONS.ANALYTICS_VIEW), clanController.clanHealth);
router.get('/insights', authenticate, requirePermissionMinScope(PERMISSIONS.ANALYTICS_VIEW), clanController.clanInsights);

// Clan detail.
router.get('/:id', authenticate, clanController.getClan);

// Create a clan - needs clan.create (super_admin, people_admin, or program_admin
// of the target program).
router.post('/', authenticate, requirePermission(PERMISSIONS.CLAN_CREATE, (req) => ({ programId: req.body.programId })), clanController.createClan);

// Update / manage members - needs clan.manage_members ON THIS CLAN. That's held
// by admins and the clan's LEAD MENTOR (not co-mentors). This is how a lead
// mentor adds a co-mentor / core-team member to their own clan.
router.patch('/:id', authenticate, requirePermission(PERMISSIONS.CLAN_MANAGE_MEMBERS, scope.clan('id')), clanController.updateClan);
router.post('/:id/members', authenticate, requirePermission(PERMISSIONS.CLAN_MANAGE_MEMBERS, scope.clan('id')), clanController.addMember);
router.delete('/:id/members/:userId', authenticate, requirePermission(PERMISSIONS.CLAN_MANAGE_MEMBERS, scope.clan('id')), clanController.removeMember);

// Reassign a mentee to a different clan (cross-clan admin action). Program admins
// may only move within programs they administer (enforced in the controller).
router.post('/reassign', authenticate, requirePermissionMinScope(PERMISSIONS.CLAN_MANAGE_MEMBERS, 'program'), clanController.reassignClan);

// Lead mentor: pull in unassigned mentees, or invite a new one straight into the clan.
router.get('/:id/available', authenticate, requirePermission(PERMISSIONS.CLAN_MANAGE_MEMBERS, scope.clan('id')), clanController.availableMembers);
router.post('/:id/invite', authenticate, requirePermission(PERMISSIONS.CLAN_MANAGE_MEMBERS, scope.clan('id')), clanController.inviteToClan);

// Candidates for co-mentor / core-team (anyone active, not already in the clan).
router.get('/:id/candidates', authenticate, requirePermission(PERMISSIONS.CLAN_MANAGE_MEMBERS, scope.clan('id')), clanController.candidates);

// Delegate / revoke custom clan-scoped permissions within this clan (lead mentor or admin).
router.post('/:id/grants', authenticate, requirePermission(PERMISSIONS.CLAN_MANAGE_MEMBERS, scope.clan('id')), clanController.grantClanRole);
router.delete('/:id/grants/:assignmentId', authenticate, requirePermission(PERMISSIONS.CLAN_MANAGE_MEMBERS, scope.clan('id')), clanController.revokeClanRole);

module.exports = router;
