# Quick Start - Testing Auth Module

## Prerequisites

✅ PostgreSQL running on localhost:5432
✅ Database `pathment_dev` created
✅ Server running on port 5000

## Step 1: Check Server Health

```bash
curl http://localhost:5000/api/health
```

Expected Response:
```json
{
  "success": true,
  "message": "Server is running",
  "timestamp": "2025-11-09T..."
}
```

## Step 2: Register a User

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Test",
    "lastName": "User",
    "email": "test@example.com",
    "password": "SecurePass123!",
    "confirmPassword": "SecurePass123!",
    "role": "mentee"
  }'
```

Save the `accessToken` from the response!

## Step 3: Login

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123!"
  }'
```

## Step 4: Access Protected Route

Replace `YOUR_TOKEN` with the accessToken from Step 2 or 3:

```bash
curl -X GET http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Success!

If all steps work, your auth module is fully functional! 🎉

## Next: Create Database Tables

The auth module is working, but you need to create the database tables before users can actually be stored. Run migrations:

```bash
# TODO: Create and run migrations
npm run migrate
```

Or use Sequelize sync (temporary for development):
```javascript
// In src/index.js, uncomment:
await sequelize.sync({ alter: true });
```
