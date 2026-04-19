# Pathment - Enterprise Mentorship Platform

Pathment is a comprehensive SaaS-based mentorship platform that helps companies save money on employee training by connecting mentees with experienced mentors through structured learning programs.

## 🎯 Overview

Pathment enables organizations to:
- Create structured mentorship programs with multiple levels
- Match mentees with expert mentors based on skills and availability
- Track progress through AI-generated roadmaps and tasks
- Manage enrollments and mentor assignments
- Monitor mentorship outcomes and performance

## 📋 Table of Contents

- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation & Setup](#installation--setup)
- [Project Structure](#project-structure)
- [Core Concepts](#core-concepts)
- [User Roles & Flows](#user-roles--flows)
- [API Documentation](#api-documentation)
- [Technologies Used](#technologies-used)
- [Development Guide](#development-guide)
- [Troubleshooting](#troubleshooting)

---

## 🏗️ Architecture

Pathment is built as a monorepo with three main applications:

```
pathment/
├── marketing-site/      # Public marketing website (Next.js)
├── server/              # Backend API (Node.js + Express + PostgreSQL)
└── client-interface/    # Tenant frontend app (Next.js + React + TypeScript)
```

### High-Level Architecture

```
┌─────────────────┐
│  Client (Next)  │
│   Port: 3000    │
└────────┬────────┘
         │ REST API
         ▼
┌─────────────────┐
│ Server (Express)│
│   Port: 5000    │
└────────┬────────┘
         │ Sequelize ORM
         ▼
┌─────────────────┐
│   PostgreSQL    │
│   Port: 5432    │
└─────────────────┘
```

### Tech Stack

**Backend:**
- Node.js + Express.js
- PostgreSQL + Sequelize ORM
- JWT Authentication
- AI Integration (Groq/OpenAI)
- Cloudinary for file uploads

**Frontend:**
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui components
- React Context for state management

---

## ⚙️ Prerequisites

Before you begin, ensure you have the following installed:

### Required Software

- **Node.js** (v18.x or higher) - [Download](https://nodejs.org/)
- **npm** or **yarn** (comes with Node.js)
- **PostgreSQL** (v14.x or higher) - [Download](https://www.postgresql.org/download/)
- **Git** - [Download](https://git-scm.com/)

### Optional Tools

- **Postman** - For API testing
- **pgAdmin** or **DBeaver** - For database management
- **VS Code** - Recommended IDE

---

## 🚀 Installation & Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd pathment
```

### 2. Backend Setup

#### 2.1 Navigate to Server Directory

```bash
cd server
```

#### 2.2 Install Dependencies

```bash
npm install
```

#### 2.3 Create PostgreSQL Database

```bash
# Login to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE pathment_db;

# Create user (optional)
CREATE USER pathment_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE pathment_db TO pathment_user;

# Exit
\q
```

#### 2.4 Configure Environment Variables

Create `.env` file in the `server/` directory:

```env
# Server Configuration
NODE_ENV=development
PORT=5000

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=pathment_db
DB_USER=postgres
DB_PASSWORD=your_password
DB_DIALECT=postgres

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=your-refresh-secret-key
JWT_REFRESH_EXPIRES_IN=30d

# Email Configuration (for email verification)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM=noreply@pathment.com

# Cloudinary Configuration (for file uploads)
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# AI Configuration (for roadmap generation)
GROQ_API_KEY=your-groq-api-key
OPENAI_API_KEY=your-openai-api-key

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:3000
```

#### 2.5 Initialize Database

```bash
# Sync database and create tables
node scripts/syncDatabase.js

# Seed initial data (skills)
node scripts/seedSkills.js

# Create admin user
node scripts/seedAdmin.js
```

**Default Admin Credentials:**
- Email: `admin@pathment.com`
- Password: `Admin123!`

#### 2.6 Start Backend Server

```bash
# Development mode (with nodemon)
npm run dev

# Production mode
npm start
```

Server will run at: `http://localhost:5000`

### 3. Frontend Setup

#### 3.1 Navigate to Client Directory

```bash
cd ../client-interface
```

#### 3.2 Install Dependencies

```bash
npm install
```

#### 3.3 Configure Environment Variables

Create `.env.local` file in the `client-interface/` directory:

```env
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:5000/api

# App Configuration
NEXT_PUBLIC_APP_NAME=Pathment
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

#### 3.4 Start Frontend Application

```bash
# Development mode
npm run dev

# Build for production
npm run build
npm start
```

Frontend will run at: `http://localhost:3000`

---

## 📁 Project Structure

### Backend Structure (`server/`)

```
server/
├── config/
│   └── config.json              # Database configuration
├── docs/                        # API and module documentation
│   ├── API_DOCUMENTATION.md
│   ├── AUTH_MODULE_COMPLETE.md
│   └── PROGRAMS_MODULE_COMPLETE.md
├── postman/                     # Postman collection for API testing
├── scripts/                     # Database and utility scripts
│   ├── createTables.js
│   ├── seedAdmin.js
│   ├── seedSkills.js
│   ├── syncDatabase.js
│   └── recalculateMentorCounts.js
└── src/
    ├── index.js                 # Application entry point
    ├── config/
    │   └── database.js          # Database connection
    ├── controllers/             # Request handlers
    │   ├── authController.js
    │   ├── programController.js
    │   ├── enrollmentController.js
    │   ├── matchingController.js
    │   └── ...
    ├── db/
    │   └── index.js             # Database initialization
    ├── middlewares/             # Express middlewares
    │   ├── auth.js              # Authentication
    │   ├── errorHandler.js      # Error handling
    │   └── validate.js          # Request validation
    ├── models/                  # Sequelize models
    │   ├── users/               # User-related models
    │   ├── programs/            # Program-related models
    │   ├── tasks/               # Task and enrollment models
    │   └── index.js
    ├── routes/                  # API routes
    │   ├── auth.js
    │   ├── programs.js
    │   ├── enrollments.js
    │   └── ...
    ├── services/                # Business logic
    │   ├── authService.js
    │   ├── programService.js
    │   ├── matchingService.js
    │   └── ...
    ├── utils/                   # Utilities
    │   ├── errors/              # Custom error classes
    │   ├── responses/           # Response helpers
    │   └── cloudinaryUpload.js
    └── validations/             # Input validation schemas
```

### Frontend Structure (`client-interface/`)

```
client-interface/
├── app/                         # Next.js App Router
│   ├── layout.tsx               # Root layout
│   ├── page.tsx                 # Landing page
│   ├── (auth)/                  # Auth routes (grouped)
│   │   ├── login/
│   │   ├── register/
│   │   └── verify-email/
│   ├── admin/                   # Admin dashboard
│   │   ├── dashboard/
│   │   ├── programs/
│   │   ├── enrollment/
│   │   ├── matching/
│   │   └── settings/
│   ├── mentor/                  # Mentor dashboard
│   │   ├── dashboard/
│   │   ├── mentees/
│   │   ├── tasks/
│   │   └── settings/
│   └── mentee/                  # Mentee dashboard
│       ├── dashboard/
│       ├── programs/
│       ├── tasks/
│       └── settings/
├── components/                  # React components
│   ├── admin/                   # Admin-specific components
│   ├── mentor/                  # Mentor-specific components
│   ├── mentee/                  # Mentee-specific components
│   ├── shared/                  # Shared components
│   │   ├── Navigation.tsx
│   │   ├── RoleGuard.tsx
│   │   └── OnboardingGuard.tsx
│   └── ui/                      # shadcn/ui components
├── lib/                         # Libraries and utilities
│   ├── config/
│   │   └── api.ts               # API configuration
│   ├── context/
│   │   └── AuthContext.tsx      # Authentication context
│   ├── services/                # API service layer
│   │   ├── api-client.ts
│   │   ├── auth-api.ts
│   │   └── program-api.ts
│   ├── types/
│   │   └── index.ts             # TypeScript types
│   └── utils/
│       └── cn.ts                # Utility functions
└── styles/
    └── globals.css              # Global styles
```

---

## 💡 Core Concepts

### 1. **Users & Roles**

Three primary user roles:

- **Admin**: System administrator who manages programs, enrollments, and mentor assignments
- **Mentor**: Experienced professional who guides mentees through programs
- **Mentee**: Learner enrolled in programs seeking mentorship

### 2. **Programs**

Programs are structured learning paths with:
- **Multiple Levels**: Each program has sequential levels (e.g., Beginner → Intermediate → Advanced)
- **Prerequisites**: Skills required to join
- **Skill Tags**: Topics covered in the program
- **Status**: Draft, Published, Archived

### 3. **Program Levels**

Each level contains:
- **Level Order**: Sequential ordering (1, 2, 3...)
- **Duration**: Duration in weeks
- **Learning Outcomes**: What mentees will learn
- **Prerequisites**: Requirements to start this level
- **Target Audience**: Who the level is for

### 4. **Enrollments**

The enrollment flow:

```
Mentee → Browses Programs → Requests Enrollment
       ↓
Admin → Reviews Request → Approves Enrollment
       ↓
Status: pending_match → matched → active → completed
```

**Enrollment Statuses:**
- `pending_match`: Approved, awaiting mentor assignment
- `matched`: Mentor assigned, ready to start
- `active`: Currently in progress
- `level_completed`: Current level finished, moving to next
- `program_completed`: All levels completed
- `dropped`: Mentee left the program

### 5. **Mentor-Mentee Matching**

Matching process:

```
Admin → Selects Enrollment → Gets AI Suggestions
      ↓
Chooses Mentor for Level → Creates Match
      ↓
Match Status: active → completed
```

**Important**: 
- Mentors are assigned **per level**, not per program
- One mentee can have different mentors for different levels
- `currentMenteeCount` counts **unique active mentees** across all levels

### 6. **Roadmaps**

AI-generated learning paths:
- Created per program level
- Contains weekly breakdown
- Each week has multiple tasks
- Tasks can be: Assignment, Project, Quiz, Reading, Video, Discussion

### 7. **Tasks**

Task lifecycle:

```
Created → Assigned → In Progress → Submitted → Under Review → Completed
```

**Task Types:**
- `assignment`: Written work
- `project`: Coding/practical project
- `quiz`: Knowledge assessment
- `reading`: Study material
- `video`: Watch tutorial
- `discussion`: Engage in discussion

---

## 👥 User Roles & Flows

### 🔴 Admin Flow

#### Initial Setup
1. **Login** with admin credentials
2. Complete profile in settings
3. Navigate to Programs section

#### Creating a Program
1. Go to **Admin → Programs → Create**
2. Fill in program details:
   - Name
   - Description
   - Type (technical/business/design)
   - Prerequisites
   - Skill tags
   - Duration
   - Difficulty level
3. **Save as Draft**
4. Add **Program Levels**:
   - For each level, define:
     - Name
     - Order
     - Duration (weeks)
     - Description
     - Learning outcomes
     - Prerequisites
     - Target audience
5. **Publish Program**

#### Managing Enrollments
1. Go to **Admin → Enrollments**
2. View pending enrollment requests
3. Review mentee profile:
   - Learning goals
   - Prior experience
   - Current education/occupation
4. **Approve** or **Reject** enrollment
5. Once approved, status becomes `pending_match`

#### Assigning Mentors to Levels
1. Go to **Admin → Matching → Mentor Assignment**
2. Select a program
3. For each level:
   - Click **Assign Mentor**
   - View available mentors
   - Check mentor:
     - Specialization match
     - Current mentee count
     - Max capacity
     - `isAcceptingMentees` status
   - **Assign** mentor to level

#### Creating Mentor-Mentee Matches
1. Go to **Admin → Matching → Create Match**
2. Select an enrollment (status: `pending_match`)
3. Click **Get AI Suggestions**
4. Review suggested mentors:
   - Match score (skill alignment + availability)
   - Current mentee count
   - Match reasons
5. Select mentor
6. **Create Match**
7. Enrollment status → `matched`

#### Generating Roadmaps
1. Go to **Admin → Roadmap**
2. Select program level
3. Click **Generate Roadmap with AI**
4. AI creates:
   - Weekly breakdown
   - Tasks for each week
   - Task descriptions and resources
5. Review and edit if needed
6. **Save Roadmap**

#### System Settings
1. Go to **Admin → Settings**
2. Configure:
   - **System**: Auto-approve enrollments, maintenance mode
   - **User Management**: Mentor approval requirements, AI matching
   - **Notifications**: Alerts and reports
   - **Security**: Password, 2FA

### 🟢 Mentor Flow

#### Initial Setup
1. **Register** as mentor
2. **Verify email**
3. Complete **Onboarding**:
   - **Step 1**: Mentor Profile
     - Title, organization
     - Years of experience
     - Specialization
     - LinkedIn/GitHub/Portfolio
   - **Step 2**: Skills
     - Add your expertise
     - Proficiency levels

#### Managing Availability
1. Go to **Mentor → Settings → Availability**
2. Set:
   - **Accepting Mentees**: Toggle ON/OFF
   - **Max Mentees**: Set capacity (e.g., 10)
3. System prevents new assignments when:
   - `isAcceptingMentees` = false
   - Current mentees ≥ maxMentees

#### Dashboard Overview
View:
- **Current Mentees**: Unique active mentees
- **Active Programs**: Programs you're teaching
- **Pending Tasks**: Tasks awaiting your review
- **Completion Rate**: Success metrics

#### Working with Mentees
1. Go to **Mentor → Mentees**
2. View all your mentees (across all levels)
3. For each mentee:
   - View their progress
   - Current level
   - Tasks completed/pending
   - Performance metrics

#### Reviewing Tasks
1. Go to **Mentor → Tasks**
2. Filter by status: `submitted`, `under_review`
3. For each submission:
   - View task details
   - Check submission:
     - Text content
     - File attachments
     - Links
   - **Review**:
     - Approve or Request Changes
     - Add feedback
     - Rate (0-5 stars)
4. Task status → `completed` or `revision_needed`

#### Communication
- View mentee messages
- Provide feedback on tasks
- Set office hours
- Schedule 1-on-1 sessions

### 🔵 Mentee Flow

#### Registration & Onboarding
1. **Register** as mentee
2. **Verify email**
3. Complete **Onboarding**:
   - **Step 1**: Mentee Profile
     - Learning goals
     - Prior experience
     - Current education
     - Current occupation
   - **Step 2**: Skills
     - Your current skills
     - Proficiency levels

#### Browsing Programs
1. Go to **Mentee → Programs**
2. View available programs
3. Filter by:
   - Type
   - Difficulty level
   - Duration
4. Click on program to view:
   - Program description
   - All levels with details
   - Learning outcomes per level
   - Prerequisites
   - Duration

#### Enrolling in a Program
1. Select a program
2. Click **Request Enrollment**
3. Review program details
4. **Submit Request**
5. Wait for admin approval
6. Status: `pending_match` → `matched` → `active`

#### Dashboard Overview
View:
- **Enrolled Programs**: Your active programs
- **Current Level**: What you're working on
- **Tasks**: Pending and completed tasks
- **Progress**: Completion percentage
- **Mentor Info**: Your assigned mentor

#### Working on Tasks
1. Go to **Mentee → Tasks**
2. View your roadmap with weekly tasks
3. For each task:
   - Read description
   - Check resources
   - **Start Task**
   - Work on it
   - **Submit**:
     - Add text content
     - Upload files
     - Add links
4. Task status: `in_progress` → `submitted`
5. Wait for mentor review
6. If approved: `completed`
7. If changes needed: `revision_needed` → Update → Resubmit

#### Requesting Extensions
1. Find task that's overdue
2. Click **Request Extension**
3. Provide reason
4. Mentor approves/rejects
5. If approved: New deadline set

#### Settings & Preferences
1. Go to **Mentee → Settings**
2. Configure:
   - **Profile**: Update personal info
   - **Learning Info**: Update goals, experience
   - **Preferences**: 
     - Learning style
     - Time commitment
     - Schedule preferences
   - **Notifications**: Email alerts for tasks, messages

---

## 📚 API Documentation

### Authentication Endpoints

```
POST   /api/auth/register          - Register new user
POST   /api/auth/login             - Login
POST   /api/auth/verify-email      - Verify email
POST   /api/auth/forgot-password   - Request password reset
POST   /api/auth/reset-password    - Reset password
POST   /api/auth/refresh           - Refresh access token
GET    /api/auth/me                - Get current user
POST   /api/auth/logout            - Logout
```

### Program Endpoints

```
GET    /api/programs               - List all programs
POST   /api/programs               - Create program (admin)
GET    /api/programs/:id           - Get program by ID
PUT    /api/programs/:id           - Update program (admin)
DELETE /api/programs/:id           - Delete program (admin)
POST   /api/programs/:id/publish   - Publish program (admin)
GET    /api/programs/:id/levels    - Get program levels
POST   /api/programs/:id/levels    - Create level (admin)
```

### Enrollment Endpoints

```
GET    /api/enrollments            - List enrollments
POST   /api/enrollments            - Create enrollment (mentee)
GET    /api/enrollments/:id        - Get enrollment details
PATCH  /api/enrollments/:id/status - Update status (admin)
```

### Matching Endpoints

```
GET    /api/matches                       - List matches
POST   /api/matches                       - Create match (admin)
GET    /api/matches/suggestions/:id       - AI match suggestions
GET    /api/matches/levels/:id/mentors    - Get level mentors
PATCH  /api/matches/:id/status            - Update match status
```

### Profile Endpoints

```
GET    /api/profile                       - Get user profile
PUT    /api/profile                       - Update profile
POST   /api/profile/complete-mentee       - Complete mentee profile
POST   /api/profile/complete-mentor       - Complete mentor profile
POST   /api/profile/add-skills            - Add skills
PATCH  /api/profile/mentor/availability   - Update mentor availability
```

### Task Endpoints

```
GET    /api/tasks                  - List tasks
POST   /api/tasks                  - Create custom task (mentor)
GET    /api/tasks/:id              - Get task details
PUT    /api/tasks/:id              - Update task
POST   /api/tasks/:id/submit       - Submit task (mentee)
POST   /api/tasks/:id/review       - Review task (mentor)
```

For detailed API documentation, see: [server/docs/API_DOCUMENTATION.md](server/docs/API_DOCUMENTATION.md)

---

## 🛠️ Technologies Used

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **Sequelize** - ORM for PostgreSQL
- **PostgreSQL** - Database
- **JWT** - Authentication
- **bcrypt** - Password hashing
- **Joi** - Input validation
- **Nodemailer** - Email sending
- **Cloudinary** - File storage
- **Groq/OpenAI** - AI roadmap generation
- **dotenv** - Environment variables

### Frontend
- **Next.js 14** - React framework (App Router)
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **shadcn/ui** - UI components
- **Lucide Icons** - Icons
- **Sonner** - Toast notifications
- **React Hook Form** - Form handling
- **Axios** - HTTP client

---

## 👨‍💻 Development Guide

### Code Style

**Backend:**
- Use ES6+ features
- Async/await for async operations
- Error handling with custom error classes
- Service layer for business logic
- Controller layer for request handling

**Frontend:**
- Functional components with hooks
- TypeScript for type safety
- Component composition
- Custom hooks for reusable logic

### Database Migrations

When making database changes:

```bash
# Create new migration
cd server
node scripts/createMigration.js migration-name

# Run migrations
node scripts/runMigrations.js

# Reset database (development only!)
node scripts/resetDatabase.js
```

### Adding New Features

1. **Backend:**
   - Add model in `server/src/models/`
   - Create service in `server/src/services/`
   - Add controller in `server/src/controllers/`
   - Define routes in `server/src/routes/`
   - Add validation in `server/src/validations/`

2. **Frontend:**
   - Add page in `client-interface/app/`
   - Create components in `client-interface/components/`
   - Add API service in `client-interface/lib/services/`
   - Update types in `client-interface/lib/types/`

### Testing

**Backend:**
```bash
cd server
npm test                    # Run tests
npm run test:watch          # Watch mode
```

**Frontend:**
```bash
cd client-interface
npm test                    # Run tests
npm run test:e2e            # E2E tests
```

Use Postman collection in `server/postman/` for API testing.

### Common Development Tasks

**Add a new user role:**
1. Update User model enum
2. Create profile model
3. Add to authentication middleware
4. Create role-specific routes
5. Add frontend pages

**Create new task type:**
1. Update Task model enum
2. Modify task service logic
3. Update frontend task components
4. Add validation rules

**Integrate new AI provider:**
1. Create service in `server/src/services/`
2. Implement roadmap generation interface
3. Add API keys to .env
4. Update roadmapService.js

---

## 🐛 Troubleshooting

### Common Issues

**Database Connection Failed:**
```bash
# Check PostgreSQL is running
sudo service postgresql status

# Restart PostgreSQL
sudo service postgresql restart

# Check credentials in .env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
```

**JWT Token Expired:**
```bash
# Logout and login again
# Or refresh token using /api/auth/refresh
```

**CORS Errors:**
```bash
# Ensure FRONTEND_URL in server/.env matches your client URL
FRONTEND_URL=http://localhost:3000
```

**Port Already in Use:**
```bash
# Kill process on port 5000
lsof -ti:5000 | xargs kill -9

# Kill process on port 3000
lsof -ti:3000 | xargs kill -9
```

**Mentor Count Not Updating:**
```bash
# Run recalculation script
cd server
node scripts/recalculateMentorCounts.js

# Or use API endpoint
POST /api/admin/recalculate-mentor-counts
```

**AI Roadmap Generation Fails:**
```bash
# Check API keys are set
echo $GROQ_API_KEY
echo $OPENAI_API_KEY

# Ensure at least one is configured in .env
```

### Database Reset (Development Only!)

```bash
cd server

# Complete reset
node scripts/resetDatabase.js

# Re-sync tables
node scripts/syncDatabase.js

# Re-seed data
node scripts/seedSkills.js
node scripts/seedAdmin.js
```

### Logs

**Backend Logs:**
```bash
cd server
tail -f logs/app.log        # Application logs
tail -f logs/error.log      # Error logs
```

**Frontend Logs:**
Check browser console for client-side errors.

---

## 📝 Environment Variables Reference

### Backend (.env)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| NODE_ENV | Yes | Environment | development |
| PORT | Yes | Server port | 5000 |
| DB_HOST | Yes | Database host | localhost |
| DB_PORT | Yes | Database port | 5432 |
| DB_NAME | Yes | Database name | pathment_db |
| DB_USER | Yes | Database user | postgres |
| DB_PASSWORD | Yes | Database password | your_password |
| JWT_SECRET | Yes | JWT secret key | random-secret-key |
| JWT_EXPIRES_IN | Yes | Token expiration | 7d |
| FRONTEND_URL | Yes | Client URL | http://localhost:3000 |
| GROQ_API_KEY | Optional | Groq AI key | gsk_xxx |
| OPENAI_API_KEY | Optional | OpenAI key | sk-xxx |
| CLOUDINARY_CLOUD_NAME | Optional | Cloudinary name | your-cloud |
| EMAIL_HOST | Optional | Email server | smtp.gmail.com |

### Frontend (.env.local)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| NEXT_PUBLIC_API_URL | Yes | Backend API URL | http://localhost:5000/api |
| NEXT_PUBLIC_APP_NAME | Yes | App name | Pathment |
| NEXT_PUBLIC_APP_URL | Yes | Frontend URL | http://localhost:3000 |

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

---

## 📄 License

This project is proprietary and confidential.

---

## 📧 Support

For questions or issues:
- Check documentation in `server/docs/`
- Review API documentation
- Check troubleshooting section
- Contact development team

---

## 🎓 Quick Start Checklist

- [ ] Install Node.js, PostgreSQL
- [ ] Clone repository
- [ ] Setup database
- [ ] Configure backend .env
- [ ] Run `npm install` in server/
- [ ] Sync database and seed data
- [ ] Start backend server
- [ ] Configure frontend .env.local
- [ ] Run `npm install` in client-interface/
- [ ] Start frontend server
- [ ] Login with admin credentials
- [ ] Create first program
- [ ] Test complete flow

---

**Happy Coding! 🚀**
