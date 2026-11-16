const express = require('express');
const router = express.Router();
const c = require('../controllers/scheduleTemplateController');
const { authenticate, authorize } = require('../middlewares/auth');
const c2 = require('../controllers/scheduleBoardController');
const { requirePermission, requirePermissionMinScope, requirePermissionAnyScope } = require('../middlewares/authz');
const { PERMISSIONS } = require('../config/permissions');

const mentorOnly = [authenticate, authorize(['mentor', 'admin'])];
const adminOnly = [authenticate, requirePermissionMinScope(PERMISSIONS.PROGRAM_MANAGE)];

// Admin org templates (the shared library mentors import).
router.get('/org', adminOnly, c.listOrg);
router.post('/org', adminOnly, c.createOrg);
router.patch('/org/:id', adminOnly, c.updateOrg);
router.delete('/org/:id', adminOnly, c.deleteOrg);

// Templates (mentor).
router.get('/templates', mentorOnly, c.listTemplates);
router.post('/templates', mentorOnly, c.createTemplate);
router.post('/templates/import', mentorOnly, c.importTemplate);
router.patch('/templates/:id', mentorOnly, c.updateTemplate);
router.delete('/templates/:id', mentorOnly, c.deleteTemplate);
router.post('/templates/:id/assign', mentorOnly, c.assign);

// Per-mentee schedule.
router.get('/me', authenticate, c.getMySchedule);                 // mentee's own
router.get('/mentee/:id', mentorOnly, c.getMenteeSchedule);       // mentor viewing a mentee
router.patch('/mentee/:id/slot/:slotId', mentorOnly, c.updateSlot); // fill a slot
router.post('/slot/:slotId/apply-all', mentorOnly, c.applySlotToAll); // push one slot config to all mentees
router.post('/slot/:slotId/activate', mentorOnly, c.activateSlot); // generate recurring tasks now for all mentees

/**
 * The day planner.
 *
 * Deliberately NOT behind `mentorOnly`. Every other route in this file gates on
 * `authorize(['mentor','admin'])` — the legacy account-role array — which is
 * why a mentee has only ever had `GET /me` and could not change a thing.
 * Widening that array would have handed mentees a mentor's powers wholesale.
 *
 * These gate on `schedule.plan` instead, which a mentee holds at SELF scope and
 * a mentor at CLAN scope. The service resolves both against one resource, so a
 * mentee can arrange their own day and nobody else's, and nothing had to be
 * loosened to let them.
 */
const canPlan = [authenticate, requirePermissionAnyScope(PERMISSIONS.SCHEDULE_PLAN)];

router.post('/board/strips', canPlan, c2.strips);
router.get('/board/:menteeId', canPlan, c2.getBoard);
router.get('/board/:menteeId/strip', canPlan, c2.strip);
router.post('/board/:menteeId/slots', canPlan, c2.addSlot);
router.patch('/board/:menteeId/slots/:slotId', canPlan, c2.updateSlot);
router.delete('/board/:menteeId/slots/:slotId', canPlan, c2.removeSlot);
router.post('/board/:menteeId/slots/:slotId/items', canPlan, c2.addItem);
router.post('/board/:menteeId/slots/:slotId/hide', canPlan, c2.hideSlot);
router.get('/board/:menteeId/templates', canPlan, c2.listTemplates);
router.post('/board/:menteeId/apply-template', canPlan, c2.applyTemplate);
router.patch('/board/items/:taskId/move', canPlan, c2.moveItem);
router.patch('/board/items/:taskId/done', canPlan, c2.completeItem);
router.patch('/board/items/:taskId/repeat', canPlan, c2.setItemRepeat);

module.exports = router;
