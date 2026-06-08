const express = require('express');
const router = express.Router();
const cohortController = require('../controllers/cohortController');
const cohortReviewController = require('../controllers/cohortReviewController');
const linearRoadmapController = require('../controllers/linearRoadmapController');
const promotionController = require('../controllers/promotionController');
const { authenticate, authorize } = require('../middlewares/auth');
const { requirePermission } = require('../middlewares/authz');
const { PERMISSIONS } = require('../config/permissions');

const mentorOnly = [authenticate, authorize(['mentor', 'admin'])];

/**
 * Mentor-area routes - scoped to the logged-in mentor (distinct from the
 * admin-facing /mentors directory listing).
 */

// The mentor's cohort for the Cockpit.
router.get('/cohort', authenticate, authorize(['mentor', 'admin']), cohortController.getCohort);
// Period-scoped cohort throughput (week / month window).
router.get('/cohort/activity', authenticate, authorize(['mentor', 'admin']), cohortController.getCohortActivity);
// AI-drafted narrative summary of the cohort (uses the mentor's AI connection).
router.post('/cohort/report-summary', authenticate, authorize(['mentor', 'admin']), cohortController.getCohortReportSummary);

// Rich profile bundle for a single mentee.
router.get('/mentee/:id', authenticate, authorize(['mentor', 'admin']), cohortController.getMenteeProfile);

// Working-style (personality) + insight logging for a mentee.
router.patch('/mentee/:id/personality', mentorOnly, cohortController.updatePersonality);
router.post('/mentee/:id/insights', mentorOnly, cohortController.addInsight);
router.post('/mentee/:id/notes', mentorOnly, cohortController.logMeetingNote);
router.post('/mentee/:id/attendance', mentorOnly, cohortController.setAttendance);
router.get('/review/attendance', authenticate, authorize(['mentor', 'admin']), cohortController.getReviewAttendance);

// Dated, saved, editable cohort-review sessions (full history). `today` and the
// bare collection are declared before `:id` so they aren't captured as an id.
router.get('/review/sessions/today', mentorOnly, cohortReviewController.today);
router.get('/review/sessions', mentorOnly, cohortReviewController.list);
router.post('/review/sessions', mentorOnly, cohortReviewController.create);
router.get('/review/sessions/:id', mentorOnly, cohortReviewController.get);
router.patch('/review/sessions/:id', mentorOnly, cohortReviewController.update);
router.put('/review/sessions/:id/entries/:menteeId', mentorOnly, cohortReviewController.setEntry);
router.post('/review/sessions/:id/finish', mentorOnly, cohortReviewController.finish);
router.post('/review/sessions/:id/reopen', mentorOnly, cohortReviewController.reopen);
router.delete('/review/sessions/:id', mentorOnly, cohortReviewController.remove);
router.post('/mentee/:id/collaborators', mentorOnly, cohortController.addCollaborator);
router.delete('/mentee/:id/collaborators/:collaboratorId', mentorOnly, cohortController.removeCollaborator);

// Approvals queue + bulk approve.
router.get('/approvals', authenticate, authorize(['mentor', 'admin']), cohortController.getApprovals);
router.post('/approvals/bulk', authenticate, authorize(['mentor', 'admin']), cohortController.bulkApprove);

// Nudge a mentee.
router.post('/nudge', authenticate, authorize(['mentor', 'admin']), cohortController.nudge);

// Linear roadmaps (author / import / assign).
router.get('/roadmaps', mentorOnly, linearRoadmapController.list);
router.post('/roadmaps', mentorOnly, linearRoadmapController.create);
router.post('/roadmaps/import', mentorOnly, linearRoadmapController.importOrg);
router.get('/roadmaps/:id', mentorOnly, linearRoadmapController.getOne);
router.patch('/roadmaps/:id', mentorOnly, linearRoadmapController.updateMeta);
router.post('/roadmaps/:id/steps', mentorOnly, linearRoadmapController.addStep);
router.put('/roadmaps/:id/steps', mentorOnly, linearRoadmapController.replaceSteps);
router.delete('/roadmaps/:id/steps/:stepId', mentorOnly, linearRoadmapController.removeStep);
router.get('/roadmaps/:id/assignees', mentorOnly, linearRoadmapController.assignees);
router.post('/roadmaps/:id/assign', mentorOnly, linearRoadmapController.assign);
// Roadmap chaining: define what comes next (reusable), + manually advance a mentee.
router.post('/roadmaps/advance', mentorOnly, linearRoadmapController.advance);
router.get('/roadmaps/:id/links', mentorOnly, linearRoadmapController.getLinks);
router.put('/roadmaps/:id/links', mentorOnly, linearRoadmapController.setLinks);

// Promotions (mentee → co-mentor). Final promote is admin-gated.
router.get('/promotions', mentorOnly, promotionController.list);
router.post('/promotions', mentorOnly, promotionController.nominate);
router.patch('/promotions/:id', mentorOnly, promotionController.advance);
router.post('/promotions/:id/promote', authenticate, requirePermission(PERMISSIONS.USER_MANAGE), promotionController.promote);

module.exports = router;
