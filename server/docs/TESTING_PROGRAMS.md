# Pathment API - Programs Module Testing

## Test Admin Login First
```bash
POST http://localhost:5000/api/auth/login
{
  "email": "admin@pathment.com",
  "password": "Admin@123!ChangeMeNow"
}
```
Save the `accessToken` from response.

## Create Program (Admin/Mentor)
```bash
POST http://localhost:5000/api/programs
Authorization: Bearer YOUR_ACCESS_TOKEN
{
  "name": "Full-Stack Development Mentorship",
  "description": "Comprehensive 12-week program covering frontend and backend development with hands-on projects",
  "type": "mentorship",
  "status": "published",
  "totalDurationWeeks": 12,
  "estimatedHoursPerWeek": 10,
  "startDate": "2025-12-01",
  "endDate": "2026-02-28",
  "maxEnrollments": 50,
  "tags": ["javascript", "nodejs", "react", "mentorship"],
  "learningOutcomes": [
    "Build full-stack web applications",
    "Master React and Node.js",
    "Deploy applications to production"
  ],
  "prerequisites": "Basic programming knowledge required",
  "targetAudience": "Beginner to intermediate developers"
}
```

## Get All Programs (Public)
```bash
GET http://localhost:5000/api/programs
```

## Get Programs with Filters
```bash
GET http://localhost:5000/api/programs?type=mentorship&status=published&page=1&limit=10&sortBy=createdAt&sortOrder=DESC
```

## Search Programs
```bash
GET http://localhost:5000/api/programs?search=full-stack
```

## Get Program by ID
```bash
GET http://localhost:5000/api/programs/:programId
```

## Update Program (Admin/Creator)
```bash
PUT http://localhost:5000/api/programs/:programId
Authorization: Bearer YOUR_ACCESS_TOKEN
{
  "name": "Advanced Full-Stack Development",
  "maxEnrollments": 100
}
```

## Clone Program (Admin/Mentor)
```bash
POST http://localhost:5000/api/programs/:programId/clone
Authorization: Bearer YOUR_ACCESS_TOKEN
{
  "name": "Full-Stack Development Mentorship Q2 2026",
  "startDate": "2026-04-01",
  "endDate": "2026-06-30"
}
```

## Enroll in Program (Mentee)
First register/login as mentee, then:
```bash
POST http://localhost:5000/api/programs/:programId/enroll
Authorization: Bearer MENTEE_ACCESS_TOKEN
```

## Get Program Enrollments (Admin/Creator)
```bash
GET http://localhost:5000/api/programs/:programId/enrollments
Authorization: Bearer YOUR_ACCESS_TOKEN
```

## Get Program Statistics (Admin/Creator)
```bash
GET http://localhost:5000/api/programs/:programId/stats
Authorization: Bearer YOUR_ACCESS_TOKEN
```

## Delete Program (Admin/Creator)
```bash
DELETE http://localhost:5000/api/programs/:programId
Authorization: Bearer YOUR_ACCESS_TOKEN
```

## Test Workflow

### 1. Setup
- Login as admin: `POST /api/auth/login`
- Save access token

### 2. Create Program
- Create a program: `POST /api/programs`
- Save program ID from response

### 3. Test Visibility
- Get all programs (no auth): `GET /api/programs`
- Should see published programs only

### 4. Register Mentee
- Register new mentee: `POST /api/auth/register` with role="mentee"
- Login as mentee
- Save mentee token

### 5. Enroll
- Enroll in program: `POST /api/programs/:id/enroll` with mentee token

### 6. Check Enrollments
- Get enrollments (admin token): `GET /api/programs/:id/enrollments`
- Should see the mentee enrolled

### 7. Update & Stats
- Update program: `PUT /api/programs/:id`
- Get stats: `GET /api/programs/:id/stats`

### 8. Clone
- Clone program: `POST /api/programs/:id/clone`

## Expected Responses

### Success (201 - Created)
```json
{
  "success": true,
  "message": "Program created successfully",
  "statusCode": 201,
  "data": {
    "program": {
      "id": "uuid",
      "name": "...",
      "status": "published",
      ...
    }
  }
}
```

### Success (200 - OK)
```json
{
  "success": true,
  "message": "Programs retrieved successfully",
  "statusCode": 200,
  "data": [...],
  "pagination": {
    "total": 10,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

### Error (403 - Forbidden)
```json
{
  "status": "error",
  "message": "You do not have permission to perform this action",
  "statusCode": 403
}
```

### Error (404 - Not Found)
```json
{
  "status": "error",
  "message": "Program not found",
  "statusCode": 404
}
```

### Error (409 - Conflict)
```json
{
  "status": "error",
  "message": "Already enrolled in this program",
  "statusCode": 409
}
```
