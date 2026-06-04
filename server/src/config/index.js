require('dotenv').config();

module.exports = {
  // Server
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',

  // Database
  databaseUrl: process.env.DATABASE_URL,

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d'
  },

  // AI API (Groq/OpenAI)
  ai: {
    apiKey: process.env.AI_API_KEY || process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY || '',
    model: process.env.AI_MODEL || 'llama-3.1-8b-instant',
    baseURL: process.env.AI_BASE_URL || 'https://api.groq.com/openai/v1',
    provider: process.env.AI_PROVIDER || 'groq'
  },

  // Email
  email: {
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    user: process.env.EMAIL_USER,
    password: process.env.EMAIL_PASSWORD,
    from: process.env.EMAIL_FROM || 'Pathment <noreply@pathment.com>'
  },

  // File Upload
  upload: {
    dir: process.env.UPLOAD_DIR || 'uploads',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB
  },

  // Redis
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
  }
};
