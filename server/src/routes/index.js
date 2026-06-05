const express = require('express');
const router = express.Router();

const authRoutes = require('./auth');
const adminRoutes = require('./admin');
const programRoutes = require('./programs');
const enrollmentRoutes = require('./enrollments');
const matchingRoutes = require('./matching');
const mentorRoutes = require('./mentors');
const menteeRoutes = require('./mentees');
const taskRoutes = require('./tasks');
const submissionRoutes = require('./submissions');
const profileRoutes = require('./profile');
const skillRoutes = require('./skills');
const messagingRoutes = require('./messaging');
const gamificationRoutes = require('./gamification');
const activityRoutes = require('./activity');
const clanRoutes = require('./clans');
const mentorAreaRoutes = require('./mentor');
const menteeAreaRoutes = require('./mentee');
const frictionRoutes = require('./friction');
const meetingRoutes = require('./meetings');
const announcementRoutes = require('./announcements');
const communityRoutes = require('./community');
const clanRequestRoutes = require('./clanRequests');
const rewardsRoutes = require('./rewards');
const libraryRoutes = require('./library');
const scheduleRoutes = require('./schedules');
const trackRoutes = require('./tracks');
const linearRoadmapRoutes = require('./linearRoadmaps');
const mentorSpecRoutes = require('./mentorSpec');
const intakeRoutes = require('./intake');
const assessmentRoutes = require('./assessments');
const publicRoutes = require('./public');
const aiConnectionRoutes = require('./aiConnections');
const programReviewRoutes = require('./programReviews');

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

// Program routes
router.use('/programs', programRoutes);

// Enrollment and matching routes
router.use('/enrollments', enrollmentRoutes);
router.use('/matches', matchingRoutes);

// Mentor and Mentee routes
router.use('/mentors', mentorRoutes);
router.use('/mentees', menteeRoutes);

// Task routes
router.use('/tasks', taskRoutes);

// Submission routes
router.use('/submissions', submissionRoutes);

// Messaging & notifications routes
router.use('/messaging', messagingRoutes);

// Gamification routes
router.use('/gamification', gamificationRoutes);

// Activity tracking routes
router.use('/activity', activityRoutes);

// Clan routes (mentor-led groups inside a program)
router.use('/clans', clanRoutes);

// Mentor-area routes (logged-in mentor's cohort, etc.)
router.use('/mentor', mentorAreaRoutes);

// Mentee-area routes (logged-in mentee's own progress, etc.)
router.use('/mentee', menteeAreaRoutes);

// Blockers & delay events (friction / fairness inputs)
router.use('/', frictionRoutes);

// 1:1 scheduling (availability + meetings)
router.use('/meetings', meetingRoutes);

// Org announcements
router.use('/announcements', announcementRoutes);

// Mentee cohort community feed
router.use('/community', communityRoutes);

// Admin clan operations (change requests, cross-clan, policies)
router.use('/clan-requests', clanRequestRoutes);

// Rewards (gifts + redemptions)
router.use('/rewards', rewardsRoutes);

// Mentor Library (org documents)
router.use('/library', libraryRoutes);

// Schedule engine (templates + per-mentee slot schedules)
router.use('/schedules', scheduleRoutes);

// Tracks (per-mentee personal lanes)
router.use('/tracks', trackRoutes);

// Linear roadmaps: mentee progress (/me) + admin org authoring (/org)
router.use('/roadmaps', linearRoadmapRoutes);

// Mentor handbook (admin-authored org doc, read by mentors)
router.use('/mentor-spec', mentorSpecRoutes);

// Registration intake — cohorts + applications (admin)
router.use('/intake', intakeRoutes);

// Assessment authoring (admin)
router.use('/assessments', assessmentRoutes);

// Public, unauthenticated intake — program catalog + apply + applicant status
router.use('/public', publicRoutes);

// AI connections — admin BYO provider keys + feature routing
router.use('/ai-connections', aiConnectionRoutes);

// Program reviews — anonymous mentee→mentor feedback at completion
router.use('/program-reviews', programReviewRoutes);



// TODO: Add more route modules here
// router.use('/users', userRoutes);
// router.use('/notifications', notificationRoutes);

module.exports = router;
