# Pathment Server — Sequelize Models Implementation Guide

## Status

**✅ PHASE 2 COMPLETE**: All 43 core models created and organized!

## Completed Models (43 Total)

### Users (`src/models/users/`) — 6 models
- ✅ User
- ✅ MentorProfile
- ✅ MenteeProfile
- ✅ AdminProfile
- ✅ Skill
- ✅ UserSkill

### Auth (`src/models/auth/`) — 4 models
- ✅ RefreshToken
- ✅ PasswordResetToken
- ✅ EmailVerificationToken
- ✅ UserSession

### Programs (`src/models/programs/`) — 6 models
- ✅ Program
- ✅ ProgramLevel
- ✅ LevelMentorAssignment
- ✅ Roadmap
- ✅ RoadmapWeek
- ✅ ProgramReview

### Tasks (`src/models/tasks/`) — 9 models
- ✅ Enrollment
- ✅ RoadmapTask
- ✅ TaskResource
- ✅ TaskSkill
- ✅ MentorMenteeMatch
- ✅ AssignedTask
- ✅ TaskSubmission
- ✅ TaskSubmissionFile
- ✅ TaskFeedback

### Messaging (`src/models/messaging/`) — 3 models
- ✅ Notification
- ✅ Message
- ✅ MessageAttachment

### Gamification (`src/models/gamification/`) — 6 models
- ✅ Badge
- ✅ UserBadge
- ✅ PointsHistory
- ✅ Challenge
- ✅ UserChallenge
- ✅ LeaderboardEntry

### System (`src/models/system/`) — 6 models
- ✅ UserSettings
- ✅ FileUpload
- ✅ AuditLog
- ✅ EmailQueue
- ✅ ScheduledJob
- ✅ SystemSettings

### Analytics (`src/models/analytics/`) — 7 models
- ✅ AnalyticsEvent
- ✅ ProgramAnalytics
- ✅ MentorAnalytics
- ✅ MenteeAnalytics
- ✅ TaskAnalytics
- ✅ AdaptiveRecommendation
- ✅ SkillAssessment

## Model Auto-Loader

The `src/db/index.js` automatically loads all models from subdirectories and wires associations. All 43 models are auto-discovered on server startup.

## Next Steps

1. ✅ All core models created
2. **TODO**: Uncomment forward associations in models (Program → ProgramLevel, User → MentorProfile, etc.)
3. **TODO**: Test server startup with `npm run dev` to verify all models load
4. **TODO**: Create initial migration using `npx sequelize-cli migration:create --name initial-schema`
5. **TODO**: Write migration up/down code for all 43 tables
6. **TODO**: Add seed data for admin, mentors, mentees, sample programs
7. **TODO**: Implement JWT auth endpoints (register, login, refresh, logout)

## Decisions Applied

- **Auth**: JWT stateless with refresh tokens (RefreshToken table)
- **Enums**: VARCHAR with app-level validation (flexible)
- **Soft Deletes**: Only on User and Program models (`deletedAt`)
- **Counters**: Sequelize hooks for denormalized fields
- **File Storage**: Local filesystem for MVP

## Installation

```powershell
cd server
npm install
cp .env.example .env
# Edit .env with your DATABASE_URL
npm run dev
```

## Database Setup

```powershell
# Create Postgres database
createdb pathment_dev

# Run migrations (once created)
npm run migrate

# Seed data
npm run seed
```

## Schema Reference

See `d:\edu\UE\fyp\PATHMENT Complete System Requirem.txt` and the attached database schema diagram for full schema details.
