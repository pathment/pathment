const express = require('express');
const router = express.Router();
const schedulingController = require('../controllers/schedulingController');
const { authenticate, authorize } = require('../middlewares/auth');

/**
 * 1:1 scheduling (mounted at /api/meetings).
 */

// Availability - mentor publishes / lists / removes bookable slots.
router.post('/availability', authenticate, authorize(['mentor', 'admin']), schedulingController.publishSlot);
router.get('/availability/mine', authenticate, authorize(['mentor', 'admin']), schedulingController.listMyAvailability);
// Recurring weekly availability (set once, mentees book each week).
router.get('/availability/rules', authenticate, authorize(['mentor', 'admin']), schedulingController.getRules);
router.put('/availability/rules', authenticate, authorize(['mentor', 'admin']), schedulingController.saveRules);
router.delete('/availability/:id', authenticate, authorize(['mentor', 'admin']), schedulingController.deleteSlot);

// Open slots for a given mentor (mentee browsing to book).
router.get('/availability', authenticate, schedulingController.listOpenForMentor);

// Booking + meetings.
router.get('/bookable', authenticate, schedulingController.getBookable);
router.post('/book', authenticate, schedulingController.bookSlot);
router.get('/', authenticate, schedulingController.listMeetings);
router.patch('/:id/status', authenticate, schedulingController.updateMeetingStatus);

module.exports = router;
