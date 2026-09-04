require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const http = require('http');
const { sequelize } = require('./db');
const routes = require('./routes');
const { errorHandler, notFound } = require('./middlewares/errorHandler');
const { initSocket } = require('./socket');
const notificationScheduler = require('./services/notificationScheduler');
const requestContext = require('./middlewares/requestContext');

const app = express();
// Behind nginx/Vercel: trust the proxy so req.ip is the real client IP
// (also makes rate-limiting key on the true IP).
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

/**
 * Middleware Configuration
 */

// Don't advertise the framework — free information for anyone fingerprinting.
app.disable('x-powered-by');

// Security headers. CSP and COEP are off on purpose: this process serves JSON to
// other origins, not documents, so a policy here protects nothing while breaking
// the one HTML page we do return (the email unsubscribe confirmation). HSTS is
// left to the TLS terminator (Caddy), which is the only layer that knows whether
// the request actually arrived over TLS.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: false,
}));

// gzip/brotli. Production sits behind Caddy which already compresses, but local
// dev and any deploy without that terminator were serving list endpoints raw —
// and mobile clients feel that on every screen.
app.use(compression());

// CORS configuration
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

function isOriginAllowed(origin) {
  return allowedOrigins.some((allowed) => {
    if (allowed.includes('*')) {
      // Convert wildcard pattern to regex, e.g. https://*.vercel.app
      const escaped = allowed.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace('*', '[^.]+');
      return new RegExp('^' + escaped + '$').test(origin);
    }
    return allowed === origin;
  });
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. server-to-server, curl)
    if (!origin || isOriginAllowed(origin)) {
      return callback(null, true);
    }
    console.warn(`[CORS] Blocked origin: "${origin}" | Allowed patterns: ${JSON.stringify(allowedOrigins)}`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

// Body parser middleware. Stash the raw body so provider webhooks (Resend/Svix)
// can verify their HMAC signature against the EXACT received bytes — JSON.parse
// would otherwise re-serialize and break the signature.
app.use(express.json({ limit: '10mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Seed per-request audit context (IP + user-agent) for downstream audit writes.
app.use(requestContext);

// Record every state-changing request (who/what/when/result) to audit_logs.
app.use(require('./middlewares/auditTrail'));

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

// API routes. The global limiter is a backstop against runaway clients and
// crawlers; the real per-action limits live on the auth and public-intake routes.
app.use('/api', require('./middlewares/rateLimiter').apiLimiter, routes);

// Provider webhooks (Resend delivery/bounce/complaint) — public, provider-signed.
app.use('/webhooks', require('./routes/webhooks'));

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

    // Bootstrap default badges once on startup (idempotent findOrCreate).
    if (process.env.GAMIFICATION_BOOTSTRAP_DISABLED !== 'true') {
      try {
        const gamificationService = require('./services/gamificationService');
        const badgeCount = await gamificationService.createDefaultBadges();
        console.log(`✓ Gamification badges verified: ${badgeCount}`);
      } catch (bootstrapError) {
        // Do not block API startup because badges can also be initialized via admin endpoint.
        console.warn('⚠ Gamification bootstrap skipped:', bootstrapError.message);
      }
    }

    // Sync models (use migrations in production)
    // Commented out for now - use migrations instead
    // if (process.env.NODE_ENV === 'development') {
    //   await sequelize.sync({ alter: false });
    //   console.log('✓ Database models synchronized');
    // }

    // Start the DB-backed email queue worker (retries, DLQ, suppression).
    // Replaces the Redis/Bull invite worker — all mail now flows through one
    // Postgres-backed queue, keeping us inside the Upstash command budget.
    require('./workers/emailWorker').start();

    // Start HTTP + Socket.IO server
    initSocket(server);
    
    // Initialize RAG subsystem (Workers & Event Listeners)
    const { initializeRag } = require('./features/rag');
    initializeRag();

    // Initialize Certificate Queue Workers (PDF & AI Evaluation)
    if (process.env.CERTIFICATE_WORKER_DISABLED !== 'true') {
      require('./workers/certificateWorker').start();
    }
    if (process.env.NOTIFICATION_SCHEDULER_DISABLED !== 'true') {
      notificationScheduler.start();
    }

    server.listen(PORT, () => {
      console.log(`✓ Server running on port ${PORT}`);
      console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`✓ API available at: http://localhost:${PORT}/api`);
      console.log(`✓ Health check: http://localhost:${PORT}/api/health`);
      console.log(`✓ Socket.IO path: http://localhost:${PORT}/socket.io`);
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

if (require.main === module) {
  start();
}

module.exports = app;
