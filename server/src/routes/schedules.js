const express = require('express');
const router = express.Router();
const c = require('../controllers/scheduleTemplateController');
const { authenticate, authorize } = require('../middlewares/auth');
const { requirePermission } = require('../middlewares/authz');
const { PERMISSIONS } = require('../config/permissions');

const mentorOnly = [authenticate, authorize(['mentor', 'admin'])];
const adminOnly = [authenticate, requirePermission(PERMISSIONS.PROGRAM_MANAGE)];

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

module.exports = router;
