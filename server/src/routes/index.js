const express = require('express');
const router = express.Router();

const authRoutes = require('./auth');
const adminRoutes = require('./admin');
const programRoutes = require('./programs');
const levelRoutes = require('./levels');
const roadmapRoutes = require('./roadmaps');
const enrollmentRoutes = require('./enrollments');
const matchingRoutes = require('./matching');
const levelMentorRoutes = require('./levelMentors');
const mentorRoutes = require('./mentors');
const taskRoutes = require('./tasks');
const submissionRoutes = require('./submissions');
const profileRoutes = require('./profile');
const skillRoutes = require('./skills');
const messagingRoutes = require('./messaging');

/**
 * API Routes
 */

// Health check
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Auth routes
router.use('/auth', authRoutes);

// Profile and skills routes
router.use('/profile', profileRoutes);
router.use('/skills', skillRoutes);

// Admin routes (protected)
router.use('/admin', adminRoutes);

// Program routes (includes nested level and roadmap routes)
router.use('/programs', programRoutes);
router.use('/programs', levelRoutes);
router.use('/programs', roadmapRoutes);

// Standalone level and roadmap routes
router.use('/', levelRoutes);
router.use('/', roadmapRoutes);

// Enrollment and matching routes
router.use('/enrollments', enrollmentRoutes);
router.use('/matches', matchingRoutes);

// Mentor routes
router.use('/mentors', mentorRoutes);

// Task routes
router.use('/tasks', taskRoutes);

// Submission routes
router.use('/submissions', submissionRoutes);

// Messaging & notifications routes
router.use('/messaging', messagingRoutes);

// Level mentor assignment routes
router.use('/', levelMentorRoutes);


// TODO: Add more route modules here
// router.use('/users', userRoutes);
// router.use('/notifications', notificationRoutes);

module.exports = router;
