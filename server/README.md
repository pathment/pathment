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

### Authentication Module (Complete)
- ✅ User registration (mentor/mentee roles)
- ✅ Login with JWT tokens
- ✅ Token refresh mechanism
- ✅ Password reset flow
- ✅ Email verification
- ✅ Protected routes with role-based authorization
- ✅ Comprehensive validation with Joi
- ✅ Standardized error handling
- ✅ Response formatting utilities

### Infrastructure
- ✅ 43 Sequelize models (users, auth, programs, tasks, messaging, gamification, system, analytics)
- ✅ Auto-loading model system
- ✅ Custom error classes
- ✅ Validation middleware
- ✅ JWT authentication middleware
- ✅ CORS configuration
- ✅ Request logging (development)

## 📁 Project Structure

```
server/
├── src/
│   ├── controllers/        # Request handlers
│   │   └── authController.js
│   ├── services/           # Business logic
│   │   └── authService.js
│   ├── routes/             # Route definitions
│   │   ├── index.js
│   │   └── auth.js
│   ├── middlewares/        # Express middleware
│   │   ├── auth.js
│   │   ├── errorHandler.js
│   │   └── validate.js
│   ├── validations/        # Joi schemas
│   │   └── authValidation.js
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
```

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
   - Integrate nodemailer/SendGrid
   - Email templates
   - Queue system

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
