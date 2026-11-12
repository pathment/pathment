/**
 * System Pool routes.
 *
 * /api/pools/*      operators and reviewers. Every route checks the specific
 *                   pool.* permission at the POOL'S PROGRAMME — a reviewer for
 *                   one programme cannot read another programme's pool.
 *   pool.manage   create, configure, open, close
 *   pool.members  import, invite, withdraw, disqualify
 *   pool.assign   give qualifying work
 *   pool.review   review work, enter scores
 *   pool.select   shortlist, confirm, place
 *   (any of them) read the pool
 *
 * /api/candidate/*  the candidate's own pools and work — self only.
 */
const express = require('express');
const { authenticate } = require('../middlewares/auth');
const { requirePermission, requireAnyPermission } = require('../middlewares/authz');
const { AuthorizationError } = require('../utils/errors/errorTypes');
const { PERMISSIONS: P } = require('../config/permissions');
const authzService = require('../services/authzService');
const upload = require('../middlewares/upload');
const pool = require('../controllers/poolController');

const POOL_ANY = [P.POOL_MANAGE, P.POOL_MEMBERS, P.POOL_ASSIGN, P.POOL_REVIEW, P.POOL_SELECT];
const atPool = async (req) => authzService.scopeOfPool(req.params.id);
const can = (permission) => requirePermission(permission, atPool);
const canRead = requireAnyPermission(POOL_ANY, atPool);

/** The Selection pools area: any pool.* permission at org or programme scope. */
async function inPoolArea(req, res, next) {
  try {
    const assignments = req.loadAssignments ? await req.loadAssignments() : undefined;
    if (!(await authzService.hasPoolAccess(req.user, { assignments }))) {
      throw new AuthorizationError('You do not have access to selection pools');
    }
    next();
  } catch (error) {
    next(error);
  }
}

// ─── /api/pools ────────────────────────────────────────────────────────────────
const pools = express.Router();
pools.use(authenticate);

pools.get('/', inPoolArea, pool.listPools);
pools.get('/options', inPoolArea, pool.options);
pools.post('/', requirePermission(P.POOL_MANAGE, (req) => ({ programId: req.body.programId })), pool.createPool);

pools.get('/:id', canRead, pool.getPool);
pools.patch('/:id', can(P.POOL_MANAGE), pool.updatePool);
pools.post('/:id/status', can(P.POOL_MANAGE), pool.setStatus);
pools.get('/:id/history', canRead, pool.history);

// Candidates
pools.post('/:id/members/import', can(P.POOL_MEMBERS), pool.importMembers);
pools.get('/:id/applications', can(P.POOL_MEMBERS), pool.listApplications);
pools.post('/:id/members/from-applications', can(P.POOL_MEMBERS), pool.addFromApplications);
pools.post('/:id/members/:memberId/resend-invite', can(P.POOL_MEMBERS), pool.resendInvite);
// Change a candidate's level; their level-specific work is swapped to match.
pools.put('/:id/members/:memberId/level', can(P.POOL_MEMBERS), pool.setMemberLevel);
pools.post('/:id/members/:memberId/withdraw', can(P.POOL_MEMBERS), pool.withdrawMember);
pools.post('/:id/members/:memberId/disqualify', can(P.POOL_MEMBERS), pool.disqualifyMember);
pools.put('/:id/members/:memberId/manual-score', can(P.POOL_REVIEW), pool.setManualScore);

// Qualifying work
pools.get('/:id/assignments', canRead, pool.listAssignments);
pools.post('/:id/assignments', can(P.POOL_ASSIGN), pool.createAssignment);
// Several roadmap steps at once — the picker is a browse, not one form per step.
pools.post('/:id/assignments/from-roadmap', can(P.POOL_ASSIGN), pool.addRoadmapSteps);
pools.patch('/:id/assignments/:assignmentId', can(P.POOL_ASSIGN), pool.updateAssignment);
pools.post('/:id/assignments/:assignmentId/assign', can(P.POOL_ASSIGN), pool.assign);
pools.post('/:id/assignments/:assignmentId/cancel', can(P.POOL_ASSIGN), pool.cancelAssignment);
// Chosen work → one candidate (the mirror of assigning one piece to everybody).
pools.post('/:id/members/:memberId/assign', can(P.POOL_ASSIGN), pool.assignToMember);

// The pool photo. Crop → upload file → save URL, exactly as a clan photo does.
pools.post('/:id/avatar/upload', can(P.POOL_MANAGE), upload.singleSafe('file'), pool.uploadAvatar);
pools.put('/:id/avatar', can(P.POOL_MANAGE), pool.setAvatar);
pools.delete('/:id/avatar', can(P.POOL_MANAGE), pool.removeAvatar);

// Review
pools.get('/:id/review-queue', can(P.POOL_REVIEW), pool.reviewQueue);
pools.get('/:id/submissions/:submissionId', can(P.POOL_REVIEW), pool.submissionDetail);
pools.post('/:id/submissions/:submissionId/review', can(P.POOL_REVIEW), pool.reviewSubmission);

// Scores, shortlist, decisions
pools.get('/:id/scores', canRead, pool.scores);
pools.get('/:id/shortlists', canRead, pool.listShortlists);
pools.post('/:id/shortlists', can(P.POOL_SELECT), pool.generateShortlist);
pools.get('/:id/shortlists/:shortlistId', canRead, pool.getShortlist);
pools.post('/:id/shortlists/:shortlistId/confirm', can(P.POOL_SELECT), pool.confirmShortlist);
pools.post('/:id/members/:memberId/decision', can(P.POOL_SELECT), pool.setDecision);

// Placement
pools.get('/:id/placement/preview', can(P.POOL_SELECT), pool.placementPreview);
pools.put('/:id/placement/targets', can(P.POOL_SELECT), pool.setPlacementTargets);
pools.post('/:id/placement/run', can(P.POOL_SELECT), pool.runPlacement);

// ─── /api/candidate ────────────────────────────────────────────────────────────
// Self only: every handler reads req.user.id and nothing else identifies a person.
const candidate = express.Router();
candidate.use(authenticate);
candidate.get('/pools', pool.myPools);
candidate.get('/tasks', pool.myTasks);
candidate.get('/tasks/:taskId', pool.myTask);
candidate.post('/tasks/:taskId/start', pool.startMyTask);
candidate.post('/tasks/:taskId/submit', upload.arraySafe('files', 5), pool.submitMyTask);

module.exports = { pools, candidate };
