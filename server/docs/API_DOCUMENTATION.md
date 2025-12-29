# Pathment API Documentation

## Base URL
```
Development: http://localhost:5000/api
Production: TBD
```

## Authentication

All protected endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer <access_token>
```

---

## Auth Endpoints

### 1. Register User
**POST** `/api/auth/register`

Register a new user (mentor or mentee).

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@example.com",
  "password": "SecurePass123!",
  "confirmPassword": "SecurePass123!",
  "role": "mentee",
  "phoneNumber": "+1234567890",
  "dateOfBirth": "1995-05-15",
  "bio": "Aspiring developer"
}
```

**Validation Rules:**
- `firstName`: 2-50 characters, required
- `lastName`: 2-50 characters, required
- `email`: Valid email format, required, unique
- `password`: Minimum 8 characters with uppercase, lowercase, number, and special character
- `confirmPassword`: Must match password
- `role`: Either "mentor" or "mentee", required
- `phoneNumber`: Valid phone format, optional
- `dateOfBirth`: Valid date, optional
- `bio`: Max 500 characters, optional

**Success Response (201):**
```json
{
  "success": true,
  "message": "User registered successfully",
  "statusCode": 201,
  "data": {
    "user": {
      "id": "uuid",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john.doe@example.com",
      "role": "mentee",
      "isEmailVerified": false,
      "status": "active",
      "createdAt": "2025-11-09T...",
      "menteeProfile": { ... }
    },
    "tokens": {
      "accessToken": "jwt_token_here",
      "refreshToken": "refresh_token_here"
    }
  }
}
```

**Error Responses:**
- `400` - Validation error
- `409` - Email already exists

---

### 2. Login
**POST** `/api/auth/login`

Authenticate user and receive tokens.

**Request Body:**
```json
{
  "email": "john.doe@example.com",
  "password": "SecurePass123!"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "statusCode": 200,
  "data": {
    "user": {
      "id": "uuid",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john.doe@example.com",
      "role": "mentee",
      "lastLoginAt": "2025-11-09T..."
    },
    "tokens": {
      "accessToken": "jwt_token_here",
      "refreshToken": "refresh_token_here"
    }
  }
}
```

**Error Responses:**
- `401` - Invalid credentials
- `401` - Account disabled

---

### 3. Refresh Token
**POST** `/api/auth/refresh`

Get a new access token using refresh token.

**Request Body:**
```json
{
  "refreshToken": "refresh_token_here"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "statusCode": 200,
  "data": {
    "accessToken": "new_jwt_token_here"
  }
}
```

**Error Responses:**
- `401` - Invalid or expired refresh token

---

### 4. Get Current User
**GET** `/api/auth/me`

Get authenticated user's profile.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "User retrieved successfully",
  "statusCode": 200,
  "data": {
    "user": {
      "id": "uuid",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john.doe@example.com",
      "role": "mentee",
      "menteeProfile": {
        "bio": "Aspiring developer",
        "learningGoals": [],
        "currentLevel": 1,
        "totalPoints": 0
      }
    }
  }
}
```

**Error Responses:**
- `401` - Unauthorized (no token or invalid token)
- `404` - User not found

---

### 5. Logout
**POST** `/api/auth/logout`

Revoke refresh token and logout user.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "refreshToken": "refresh_token_here"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Logout successful",
  "statusCode": 200
}
```

---

### 6. Verify Email
**POST** `/api/auth/verify-email`

Verify user's email with token.

**Request Body:**
```json
{
  "token": "verification_token_from_email"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Email verified successfully",
  "statusCode": 200
}
```

**Error Responses:**
- `400` - Invalid or expired token

---

### 7. Forgot Password
**POST** `/api/auth/forgot-password`

Request password reset email.

**Request Body:**
```json
{
  "email": "john.doe@example.com"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Password reset email sent successfully",
  "statusCode": 200
}
```

**Note:** Returns success even if email doesn't exist (security best practice).

---

### 8. Reset Password
**POST** `/api/auth/reset-password`

Reset password using token from email.

**Request Body:**
```json
{
  "token": "reset_token_from_email",
  "password": "NewSecurePass123!",
  "confirmPassword": "NewSecurePass123!"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Password reset successful",
  "statusCode": 200
}
```

**Error Responses:**
- `400` - Invalid or expired token
- `400` - Validation error

---

### 9. Change Password
**POST** `/api/auth/change-password`

Change password for authenticated user.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "currentPassword": "OldPass123!",
  "newPassword": "NewSecurePass123!",
  "confirmPassword": "NewSecurePass123!"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Password changed successfully",
  "statusCode": 200
}
```

**Error Responses:**
- `401` - Current password incorrect
- `400` - Validation error

---

## Error Response Format

All error responses follow this structure:

```json
{
  "success": false,
  "message": "Error description",
  "statusCode": 400,
  "errors": [
    {
      "field": "email",
      "message": "Email is required"
    }
  ]
}
```

### Common Status Codes
- `200` - Success
- `201` - Created
- `400` - Bad Request / Validation Error
- `401` - Unauthorized (authentication failed)
- `403` - Forbidden (authorization failed)
- `404` - Not Found
- `409` - Conflict (duplicate resource)
- `422` - Unprocessable Entity
- `429` - Too Many Requests
- `500` - Internal Server Error

---

## Testing with cURL

### Register
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "password": "SecurePass123!",
    "confirmPassword": "SecurePass123!",
    "role": "mentee"
  }'
```

### Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john.doe@example.com",
    "password": "SecurePass123!"
  }'
```

### Get Current User
```bash
curl -X GET http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## Rate Limiting (Future)

To prevent abuse, rate limiting will be implemented:
- Auth endpoints: 5 requests per minute per IP
- General endpoints: 100 requests per minute per user

---

## Upcoming Endpoints

- `/api/users` - User management
- `/api/programs` - Program CRUD
- `/api/programs/:id/enroll` - Program enrollment
- `/api/tasks` - Task management
- `/api/submissions` - Task submissions
- `/api/notifications` - Notifications
- `/api/messages` - Messaging

---

**Last Updated:** November 9, 2025
