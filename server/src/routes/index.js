const express = require('express');
const router = express.Router();

const authRoutes = require('./auth');
const adminRoutes = require('./admin');
const programRoutes = require('./programs');

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

// Admin routes (protected)
router.use('/admin', adminRoutes);

// Program routes
router.use('/programs', programRoutes);

// TODO: Add more route modules here
// router.use('/users', userRoutes);
// router.use('/tasks', taskRoutes);
// router.use('/notifications', notificationRoutes);

module.exports = router;
