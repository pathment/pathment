const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const { authenticate } = require('../middlewares/auth');

// All routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/profile
 * @desc    Get current user's profile
 * @access  Private
 */
router.get('/', profileController.getProfile);

/**
 * @route   PUT /api/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put('/', profileController.updateProfile);

/**
 * @route   POST /api/profile/complete-mentee
 * @desc    Complete mentee profile during onboarding
 * @access  Private (Mentee only)
 */
router.post('/complete-mentee', profileController.completeMenteeProfile);

/**
 * @route   POST /api/profile/complete-mentor
 * @desc    Complete mentor profile during onboarding
 * @access  Private (Mentor only)
 */
router.post('/complete-mentor', profileController.completeMentorProfile);

/**
 * @route   POST /api/profile/add-skills
 * @desc    Add skills to user profile
 * @access  Private
 */
router.post('/add-skills', profileController.addUserSkills);

/**
 * @route   POST /api/profile/skip-skills
 * @desc    Skip skills step in onboarding
 * @access  Private
 */
router.post('/skip-skills', profileController.skipSkills);

/**
 * @route   GET/PATCH /api/profile/appearance
 * @desc    Read / update per-user appearance (accent color + light/dark)
 * @access  Private
 */
router.get('/appearance', profileController.getAppearance);
router.patch('/appearance', profileController.updateAppearance);

/**
 * @route   POST /api/profile/detect-timezone
 * @desc    Backfill the user's timezone from their browser (only if unset)
 * @access  Private
 */
router.post('/detect-timezone', profileController.detectTimezone);

/**
 * @route   PATCH /api/profile/preferences
 * @desc    Merge a group of settings toggles (notifications, learning, etc.)
 * @access  Private
 */
router.patch('/preferences', profileController.updatePreferences);

/**
 * @route   PATCH /api/profile/notifications
 * @desc    Update notification channel prefs the orchestrator actually reads
 * @access  Private
 */
router.patch('/notifications', profileController.updateNotificationPreferences);

/**
 * @route   PATCH /api/profile/mentor/availability
 * @desc    Update mentor availability settings (isAcceptingMentees, maxMentees)
 * @access  Private (Mentor only)
 */
router.patch('/mentor/availability', profileController.updateMentorAvailability);

module.exports = router;
