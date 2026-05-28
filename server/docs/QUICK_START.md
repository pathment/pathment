# Quick Start Guide

## Prerequisites

- PostgreSQL running on `localhost:5432`
- Database `pathment_dev` created
- Server running on port `5000`
- _(Optional)_ Redis on `localhost:6379` or `UPSTASH_REDIS_URL` set (only needed for bulk invite emails)

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

If all steps work, your auth module is fully functional.

---

## Testing the Bulk Invite Endpoint

Requires: an admin JWT token (log in as admin first and copy `accessToken`).

**Step 1 — upload a small batch:**

```bash
curl -X POST http://localhost:5000/api/admin/invites/bulk \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "invites": [
      { "email": "alice@example.com", "role": "mentee" },
      { "email": "bob@example.com",   "role": "mentor" }
    ]
  }'
```

Expected response (returned immediately, emails sent in background):

```json
{
  "success": true,
  "message": "Bulk invites processed successfully",
  "statusCode": 201,
  "data": {
    "report": {
      "successCount": 2,
      "skippedCount": 0,
      "totalProcessed": 2,
      "successfulInvites": [
        { "email": "alice@example.com", "role": "mentee" },
        { "email": "bob@example.com",   "role": "mentor" }
      ],
      "skippedInvites": []
    }
  }
}
```

Rows are skipped (not errored) when:
- The email is already registered as a user
- An active invite for that `email + role` already exists
- The same row appears twice in the same request

**Step 2 — verify emails were queued:**

Check your server logs for:
```
[invite-email-queue] job <id> completed for alice@example.com
```

Or check your Resend dashboard for delivered emails.

---

## Environment Variables Cheat-Sheet

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Min 32 chars |
| `JWT_REFRESH_SECRET` | Yes | Min 32 chars |
| `RESEND_API_KEY` | Yes (prod) | Resend API key for email delivery |
| `UPSTASH_REDIS_URL` | Yes (prod) | `rediss://default:<pass>@<host>:<port>` — from Upstash console |
| `CLIENT_URL` | Yes | Frontend origin for CORS + invite links |
| `EMAIL_NOTIFICATION_EMAILS_ENABLED` | No | Set `true` to enable notification emails |

