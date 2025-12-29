# Authentication Module Testing

## Manual Testing with cURL

### 1. Health Check
```bash
curl http://localhost:5000/api/health
```

### 2. Register a Mentee
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Jane",
    "lastName": "Smith",
    "email": "jane.smith@example.com",
    "password": "SecurePass123!",
    "confirmPassword": "SecurePass123!",
    "role": "mentee",
    "bio": "Aspiring full-stack developer"
  }'
```

### 3. Register a Mentor
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Mentor",
    "email": "john.mentor@example.com",
    "password": "MentorPass123!",
    "confirmPassword": "MentorPass123!",
    "role": "mentor",
    "bio": "Senior software engineer with 10 years experience"
  }'
```

### 4. Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "jane.smith@example.com",
    "password": "SecurePass123!"
  }'
```

Save the `accessToken` and `refreshToken` from the response.

### 5. Get Current User (Protected Route)
```bash
curl -X GET http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE"
```

### 6. Refresh Token
```bash
curl -X POST http://localhost:5000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "YOUR_REFRESH_TOKEN_HERE"
  }'
```

### 7. Change Password
```bash
curl -X POST http://localhost:5000/api/auth/change-password \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "SecurePass123!",
    "newPassword": "NewSecurePass456!",
    "confirmPassword": "NewSecurePass456!"
  }'
```

### 8. Logout
```bash
curl -X POST http://localhost:5000/api/auth/logout \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "YOUR_REFRESH_TOKEN_HERE"
  }'
```

## PowerShell Testing (Windows)

### Health Check
```powershell
Invoke-RestMethod -Uri "http://localhost:5000/api/health" -Method GET
```

### Register
```powershell
$registerData = @{
    firstName = "Jane"
    lastName = "Smith"
    email = "jane.smith@example.com"
    password = "SecurePass123!"
    confirmPassword = "SecurePass123!"
    role = "mentee"
    bio = "Aspiring developer"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5000/api/auth/register" `
  -Method POST `
  -ContentType "application/json" `
  -Body $registerData
```

### Login
```powershell
$loginData = @{
    email = "jane.smith@example.com"
    password = "SecurePass123!"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:5000/api/auth/login" `
  -Method POST `
  -ContentType "application/json" `
  -Body $loginData

$accessToken = $response.data.tokens.accessToken
Write-Host "Access Token: $accessToken"
```

### Get Current User
```powershell
$headers = @{
    "Authorization" = "Bearer $accessToken"
}

Invoke-RestMethod -Uri "http://localhost:5000/api/auth/me" `
  -Method GET `
  -Headers $headers
```

## Testing Validation Errors

### Missing Required Fields
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "email": "test@example.com"
  }'
```

Expected: 400 error with validation messages

### Invalid Email Format
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "email": "invalid-email",
    "password": "SecurePass123!",
    "confirmPassword": "SecurePass123!",
    "role": "mentee"
  }'
```

Expected: 400 error with email validation message

### Weak Password
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "password": "weak",
    "confirmPassword": "weak",
    "role": "mentee"
  }'
```

Expected: 400 error with password validation message

### Password Mismatch
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "password": "SecurePass123!",
    "confirmPassword": "DifferentPass123!",
    "role": "mentee"
  }'
```

Expected: 400 error with password mismatch message

### Invalid Role
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "password": "SecurePass123!",
    "confirmPassword": "SecurePass123!",
    "role": "invalid_role"
  }'
```

Expected: 400 error with role validation message

### Duplicate Email
```bash
# Register first user
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "First",
    "lastName": "User",
    "email": "duplicate@example.com",
    "password": "SecurePass123!",
    "confirmPassword": "SecurePass123!",
    "role": "mentee"
  }'

# Try to register with same email
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Second",
    "lastName": "User",
    "email": "duplicate@example.com",
    "password": "SecurePass123!",
    "confirmPassword": "SecurePass123!",
    "role": "mentee"
  }'
```

Expected: 409 conflict error

### Invalid Credentials (Login)
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "jane.smith@example.com",
    "password": "WrongPassword123!"
  }'
```

Expected: 401 authentication error

### Unauthorized Access (No Token)
```bash
curl -X GET http://localhost:5000/api/auth/me
```

Expected: 401 authentication error

### Invalid Token
```bash
curl -X GET http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer invalid_token_here"
```

Expected: 401 authentication error

## Checklist

- [ ] Health check endpoint works
- [ ] User registration creates user with proper profile (mentee/mentor)
- [ ] Login returns access and refresh tokens
- [ ] Protected routes require authentication
- [ ] Token refresh works correctly
- [ ] Logout revokes refresh token
- [ ] Validation errors return proper messages
- [ ] Duplicate email returns 409 error
- [ ] Invalid credentials return 401 error
- [ ] Password change works for authenticated users
- [ ] Unauthorized access returns 401 error

## Next Steps After Testing

1. Create database migrations for all 43 models
2. Add seed data for testing
3. Implement email service for verification and password reset
4. Add rate limiting middleware
5. Implement user profile endpoints
6. Create program management endpoints
