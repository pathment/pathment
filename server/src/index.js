require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { sequelize } = require('./db');
const routes = require('./routes');
const { errorHandler, notFound } = require('./middlewares/errorHandler');

const app = express();
const PORT = process.env.PORT || 5000;

/**
 * Middleware Configuration
 */

// CORS configuration
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging in development
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

/**
 * Routes
 */

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Pathment API Server',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// API routes
app.use('/api', routes);

// 404 handler - must be after all routes
app.use(notFound);

// Global error handler - must be last
app.use(errorHandler);

/**
 * Server Startup
 */
async function start() {
  try {
    // Test database connection
    await sequelize.authenticate();
    console.log('✓ Database connection established successfully');

    // Sync models (use migrations in production)
    // Commented out for now - use migrations instead
    // if (process.env.NODE_ENV === 'development') {
    //   await sequelize.sync({ alter: false });
    //   console.log('✓ Database models synchronized');
    // }

    // Start server
    app.listen(PORT, () => {
      console.log(`✓ Server running on port ${PORT}`);
      console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`✓ API available at: http://localhost:${PORT}/api`);
      console.log(`✓ Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (err) {
    console.error('✗ Failed to start server:', err);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION! 💥 Shutting down...');
  console.error(err);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  console.error(err);
  process.exit(1);
});

start();
