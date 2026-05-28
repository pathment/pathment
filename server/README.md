# Pathment Server — Node.js + Express + Sequelize

Enterprise-grade backend server for the Pathment mentorship platform with complete authentication system.

## 🚀 Quick Start

```bash
# 1. Install dependencies
cd server
npm install

# 2. Configure environment
# Edit .env with your database credentials
DATABASE_URL=postgres://user:password@localhost:5432/pathment_dev

# 3. Create database
createdb pathment_dev

# 4. Start development server
npm run dev

# Server will run on http://localhost:5000
```

## ✅ Completed Features

### Authentication Module
- ✅ User registration (mentor/mentee roles)
- ✅ Login with JWT tokens
- ✅ Token refresh mechanism
- ✅ Password reset flow
- ✅ Email verification
- ✅ Protected routes with role-based authorization
- ✅ Comprehensive validation with Joi
- ✅ Standardized error handling
- ✅ Response formatting utilities

### Admin — Bulk User Invitation via CSV
- ✅ `POST /api/v1/admin/invites/bulk` — accepts a JSON array of `{ email, role }` rows
- ✅ Deduplication: skips emails already registered or holding an active invite
- ✅ Bulk DB insert via Sequelize `bulkCreate` (single round-trip per 500 rows)
- ✅ Each invite email is enqueued as an independent Bull job — response is returned immediately
- ✅ Bull worker (`inviteEmailWorker.js`) processes up to 10 emails concurrently
- ✅ Automatic retries (3 attempts, exponential backoff) on delivery failure
- ✅ Upstash Redis polling intervals tuned to stay within the free-tier 10k commands/day limit

### Infrastructure
- ✅ 43 Sequelize models (users, auth, programs, tasks, messaging, gamification, system, analytics)
- ✅ Auto-loading model system
- ✅ Custom error classes
- ✅ Validation middleware
- ✅ JWT authentication middleware
- ✅ CORS configuration
- ✅ Request logging (development)
- ✅ Bull + Upstash Redis for background job queuing

## 📁 Project Structure

```
server/
├── src/
│   ├── controllers/        # Request handlers (thin — delegate to services)
│   ├── services/           # Business logic
│   ├── routes/             # Express route definitions
│   ├── middlewares/        # auth, errorHandler, validate, rateLimit
│   ├── validations/        # Joi schemas
│   ├── queues/             # Bull queue definitions (Redis-backed)
│   │   └── inviteEmailQueue.js
│   ├── workers/            # Bull job processors
│   │   └── inviteEmailWorker.js
│   ├── models/             # Sequelize models (43 total)
│   │   ├── users/          # 6 models
│   │   ├── auth/           # 4 models
│   │   ├── programs/       # 6 models
│   │   ├── tasks/          # 9 models
│   │   ├── messaging/      # 3 models
│   │   ├── gamification/   # 6 models
│   │   ├── system/         # 6 models
│   │   └── analytics/      # 7 models
│   ├── utils/
│   │   ├── errors/         # Error classes
│   │   ├── responses/      # Response formatters
│   │   └── jwt.js          # JWT utilities
│   ├── db/
│   │   └── index.js        # Sequelize connection
│   └── index.js            # Server entry point
├── docs/
│   ├── AUTH_MODULE_COMPLETE.md
│   ├── API_DOCUMENTATION.md
│   ├── TESTING_AUTH.md
│   ├── QUICK_START.md
│   ├── IMPLEMENTATION_SUMMARY.md
│   └── MODELS_STATUS.md
├── .env
├── package.json
└── README.md
```

## 🔑 API Endpoints

### Public Endpoints
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login and get tokens
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/verify-email` - Verify email
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password

### Protected Endpoints
- `GET /api/auth/me` - Get current user
- `POST /api/auth/change-password` - Change password
- `POST /api/auth/logout` - Logout user

### Utility Endpoints
- `GET /` - Server info
- `GET /api/health` - Health check

See [API_DOCUMENTATION.md](./docs/API_DOCUMENTATION.md) for detailed endpoint documentation.

## 🧪 Testing

```bash
# Health check
curl http://localhost:5000/api/health

# Register
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "password": "SecurePass123!",
    "confirmPassword": "SecurePass123!",
    "role": "mentee"
  }'

# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "SecurePass123!"
  }'
```

See [TESTING_AUTH.md](./docs/TESTING_AUTH.md) for comprehensive testing guide.

## 🛠️ Tech Stack

- **Runtime**: Node.js v20+
- **Framework**: Express v4.18.2
- **ORM**: Sequelize v6.32.1
- **Database**: PostgreSQL
- **Authentication**: JWT (jsonwebtoken v9.0.2)
- **Validation**: Joi
- **Password Hashing**: bcrypt v5.1.1
- **Email**: Resend
- **Background jobs**: Bull v4 + Upstash Redis (serverless Redis — free tier)
- **Dev Tools**: nodemon, sequelize-cli

## 📝 Environment Variables

```env
# Server
PORT=5000
NODE_ENV=development

# Database
DATABASE_URL=postgres://user:password@localhost:5432/pathment_dev

# JWT
JWT_SECRET=your-secret-minimum-32-characters
JWT_REFRESH_SECRET=your-refresh-secret-minimum-32-characters
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# CORS
CLIENT_URL=http://localhost:3000

# Email (Resend)
RESEND_API_KEY=your_resend_api_key
RESEND_FROM=Pathment <noreply@yourdomain.com>
RESEND_REPLY_TO=support@yourdomain.com
EMAIL_NOTIFICATION_EMAILS_ENABLED=false

# Optional safeguards for free-tier quota control
EMAIL_DISABLED_EVENTS=submission_deadline_passed
EMAIL_DAILY_LIMIT=100
EMAIL_DAILY_LIMIT_PER_RECIPIENT=20

# Upstash Redis (Bull queue — bulk invite emails)
# Get this from https://console.upstash.com → your database → REST URL section
# Format: rediss://default:<password>@<host>:<port>
# If absent, falls back to localhost:6379 (local dev without Redis is fine)
UPSTASH_REDIS_URL=rediss://default:your_password@your-host.upstash.io:6379
```

## ⚡ Background Jobs (Bull + Upstash Redis)

Bulk invite emails are sent asynchronously so the HTTP response is returned immediately regardless of cohort size.

### Flow

```
POST /api/v1/admin/invites/bulk
        │
        ▼
adminService.bulkCreateRegistrationInvites()
  1. Normalize & deduplicate rows
  2. Check DB for existing users + active invites
  3. bulkCreate() all valid records (batched at 500 rows)
  4. inviteEmailQueue.addBulk(jobs)  ← enqueue one job per invite
        │
        ▼
  Return summary immediately { successCount, skippedCount, ... }

        │  (async, in background)
        ▼
inviteEmailWorker.js  (concurrency: 10)
  per job: build invite URL → notificationOrchestrator.sendRegistrationInviteEmail()
  on failure: Bull retries up to 3× with exponential backoff (10 s base)
```

### Queue configuration (Upstash free-tier friendly)

| Setting | Value | Why |
|---|---|---|
| `stalledInterval` | 5 min | Default (5 s) would burn ~24 ops/min with zero jobs |
| `guardInterval` | 5 min | Same reason |
| `removeOnComplete` | `true` | Jobs deleted immediately — no keys left in Redis |
| `removeOnFail` | `true` | Same |
| Worker concurrency | 10 | Sends 10 emails in parallel per tick |

> **Free-tier budget:** Upstash gives 10 000 commands/day. With the tuned intervals, idle overhead is ~2–3 ops/min, leaving the full daily budget for actual job processing.

### Adding a Redis instance (local dev)

If `UPSTASH_REDIS_URL` is not set the queue falls back to `localhost:6379`. Install Redis locally:

```bash
# macOS
brew install redis && brew services start redis

# Ubuntu/Debian
sudo apt install redis-server && sudo systemctl start redis
```

For local dev without Redis at all, bulk invites degrade gracefully — the queue connection error is logged but the server keeps running.

## 🔒 Security Features

- ✅ Bcrypt password hashing (12 rounds)
- ✅ JWT with access + refresh tokens
- ✅ Token revocation support
- ✅ Input validation and sanitization
- ✅ SQL injection prevention (Sequelize ORM)
- ✅ CORS configuration
- ✅ Secure error handling (no data leaks)
- ✅ Role-based access control

## 📋 Next Steps

1. **Database Migrations**
   ```bash
   npx sequelize-cli migration:create --name initial-schema
   npm run migrate
   ```

2. **Seed Data**
   ```bash
   npx sequelize-cli seed:create --name demo-users
   npm run seed
   ```

3. **Email Service**
   - Configure Resend credentials in `.env`
   - Customize email templates
   - Queue/retry policy for delivery failures

4. **Rate Limiting**
   - Install express-rate-limit
   - Configure per-endpoint limits

5. **Additional Modules**
   - User profile management
   - Program CRUD
   - Task management
   - Notifications
   - Messaging

## 📚 Documentation

- [API Documentation](./docs/API_DOCUMENTATION.md) - Complete API reference
- [Auth Module](./docs/AUTH_MODULE_COMPLETE.md) - Authentication implementation details
- [Testing Guide](./docs/TESTING_AUTH.md) - Manual testing instructions
- [Models Status](./docs/MODELS_STATUS.md) - Database models overview
- [Implementation Summary](./docs/IMPLEMENTATION_SUMMARY.md) - Full implementation details

## 🤝 Development Workflow

```bash
# Start development server with hot reload
npm run dev

# Run linting (when configured)
npm run lint

# Run tests (when implemented)
npm test

# Run migrations
npm run migrate

# Run seeds
npm run seed
```

## 🐛 Troubleshooting

**Database connection error:**
- Check PostgreSQL is running
- Verify DATABASE_URL in .env
- Ensure database exists: `createdb pathment_dev`

**Port already in use:**
- Change PORT in .env
- Or stop process using port 5000

**JWT errors:**
- Verify JWT_SECRET and JWT_REFRESH_SECRET are set
- Ensure secrets are at least 32 characters

## 📄 License

Proprietary - Pathment Platform

## 👥 Team

Backend Development Team - Pathment

---

**Status**: ✅ Authentication Module Complete
**Version**: 1.0.0
**Last Updated**: November 9, 2025
