# Pathment - Database Schema & ER Diagrams

> **Audience:** new contributors and anyone who wants to understand how Pathment's
> data fits together, zero to hero. This document is the single source of truth for
> the data model. It is generated from the Sequelize models under
> [`server/src/models/`](../server/src/models) - when you change a model, update the
> matching diagram here.

The diagrams below use [Mermaid](https://mermaid.js.org/syntax/entityRelationshipDiagram.html),
which renders natively on GitHub. If you're reading this in an editor without Mermaid,
paste a block into the [Mermaid Live Editor](https://mermaid.live).

**Relationship cardinality cheat-sheet**

| Symbol | Meaning |
| --- | --- |
| `||--o{` | one-to-many (one A has many B) |
| `||--||` | one-to-one |
| `}o--o{` | many-to-many (via a join table) |
| `||--o|` | one-to-zero-or-one (optional) |

---

## 1. Conventions (read this first)

Every model follows the same rules, so the diagrams only show what is *distinctive*
about each table.

- **Primary keys** are `UUID` (`id`, `defaultValue: UUIDV4`) unless noted.
- **Column naming** is `underscored` in Postgres (`first_name`) and `camelCase` in JS
  (`firstName`). Diagrams use the JS names.
- **Timestamps** (`created_at`, `updated_at`) exist on most tables; a few are
  `timestamps: false` or `updatedAt: false` (append-only logs).
- **Soft deletes** (`paranoid`, adds `deleted_at`) are used on `users`, `programs`,
  and `two_factor_auths`.
- **Models auto-load** recursively from `server/src/models/**` via
  [`server/src/db/index.js`](../server/src/db/index.js); each model's `associate()`
  runs after all models are registered.
- **Foreign keys** are not always declared as DB-level constraints; relationships are
  expressed through Sequelize associations. The diagrams reflect the *logical* model.

**Domain map** (83 models across 10 domains):

| Domain | Folder | What it owns |
| --- | --- | --- |
| Users & Profiles | `models/users/` | User identity, role-specific profiles, skills, mentor notes |
| Auth & Tokens | `models/auth/` | Sessions, refresh/reset/verify tokens, 2FA, **registration invites** |
| Programs & Community structure | `models/programs/` | Programs, **cohorts**, clans, memberships, roadmaps, reviews |
| Intake | `models/intake/` | **Applications** + **Assessments** (public/import intake into a cohort) |
| Roadmaps & Tasks | `models/tasks/` | Enrollments, assigned tasks, submissions, feedback, blockers |
| Messaging | `models/messaging/` | Conversations, messages, reactions, notifications |
| Gamification | `models/gamification/` | Badges, points, challenges, leaderboards, gifts |
| Scheduling | `models/scheduling/` | Availability, meetings, notes, schedule templates |
| Analytics | `models/analytics/` | Per-user/program/task rollups, activity, skill assessments |
| System & Community feed | `models/system/` | Announcements, community posts, settings, audit, files, AI keys |

---

## 2. The spine - core entities at a glance

This is the 20% of the schema that explains 80% of the product: how a person becomes
a placed, enrolled mentee working through tasks inside a clan.

```mermaid
erDiagram
    USER ||--o| MENTOR_PROFILE : "has"
    USER ||--o| MENTEE_PROFILE : "has"
    USER ||--o| ADMIN_PROFILE : "has"

    PROGRAM ||--o{ COHORT : "runs intake seasons"
    PROGRAM ||--o{ CLAN : "is divided into"
    PROGRAM ||--o{ ROADMAP : "defines"
    PROGRAM ||--o{ ENROLLMENT : "enrolls"

    COHORT ||--o{ APPLICATION : "collects"
    APPLICATION ||--o| REGISTRATION_INVITE : "accepted to"
    REGISTRATION_INVITE ||--o| USER : "consumed by (register)"

    USER ||--o{ ENROLLMENT : "as mentee"
    ENROLLMENT ||--o| COHORT : "came from"
    ENROLLMENT ||--o{ CLAN_MEMBERSHIP : "placed via"
    CLAN ||--o{ CLAN_MEMBERSHIP : "groups"
    USER ||--o{ CLAN_MEMBERSHIP : "member of"

    ROADMAP ||--o{ ROADMAP_TASK : "ordered steps"
    ROADMAP_TASK ||--o{ ASSIGNED_TASK : "assigned as"
    ENROLLMENT ||--o{ ASSIGNED_TASK : "scopes"
    USER ||--o{ ASSIGNED_TASK : "mentee / mentor"
    ASSIGNED_TASK ||--o{ TASK_SUBMISSION : "submitted"
    TASK_SUBMISSION ||--o{ TASK_FEEDBACK : "reviewed"
```

**Read it as a life-cycle:**

1. **Apply** - a person submits an `APPLICATION` into an open `COHORT` (of a `PROGRAM`).
2. **Accept** - an admin accepts it, which issues a `REGISTRATION_INVITE` carrying the
   `programId` + optional `clanId` + `cohortId`.
3. **Register** - the invite is consumed at sign-up, creating the `USER` (+ profile).
4. **Place** - registration creates an `ENROLLMENT` (program + cohort) and a
   `CLAN_MEMBERSHIP` (the clan), linked together by `enrollmentId`.
5. **Work** - the program's `ROADMAP` → `ROADMAP_TASK`s are handed out as
   `ASSIGNED_TASK`s; the mentee files `TASK_SUBMISSION`s; the mentor leaves
   `TASK_FEEDBACK`. `ENROLLMENT` progress is recomputed from the assigned tasks.

---

## 3. Users & Profiles (`models/users/`)

A single `User` row is the identity; role-specific data lives in one-to-one profile
tables. `capabilities` is a superset array of roles so one person can hold multiple
views (e.g. a mentee who is also an admin).

```mermaid
erDiagram
    USER {
        uuid id PK
        string email UK
        string passwordHash
        string role "admin | mentor | mentee"
        string[] capabilities "superset of role"
        string status "active | inactive | pending | suspended"
        string firstName
        string lastName
        bool emailVerified
        int onboardingStep "0..3"
        bool profileCompleted
    }
    MENTOR_PROFILE {
        uuid id PK
        uuid userId FK,UK
        string title
        int maxMentees
        int currentMenteeCount
        bool isAcceptingMentees
    }
    MENTEE_PROFILE {
        uuid id PK
        uuid userId FK,UK
        jsonb personality "4 dims 0-100"
        string[] learningGoals
        string[] interests
        int currentLevel
        int totalPoints
    }
    ADMIN_PROFILE {
        uuid id PK
        uuid userId FK,UK
        jsonb permissions
    }
    SKILL {
        uuid id PK
        string name UK
        string category
    }
    USER_SKILL {
        uuid id PK
        uuid userId FK
        uuid skillId FK
        int proficiencyLevel "1-100"
    }
    COLLABORATOR {
        uuid id PK
        uuid menteeId FK
        string name
        string status "invited | active"
    }
    INSIGHT {
        uuid id PK
        uuid menteeId FK
        string kind
        text note
    }
    PROMOTION_CANDIDATE {
        uuid id PK
        uuid menteeId FK
        uuid nominatedBy FK
        string stage "nominated | interview | approved | promoted"
    }

    USER ||--o| MENTOR_PROFILE : "has"
    USER ||--o| MENTEE_PROFILE : "has"
    USER ||--o| ADMIN_PROFILE : "has"
    USER ||--o{ USER_SKILL : "rated in"
    SKILL ||--o{ USER_SKILL : "held by"
    USER ||--o{ COLLABORATOR : "lists (mentee)"
    USER ||--o{ INSIGHT : "described by (mentee)"
    USER ||--o{ PROMOTION_CANDIDATE : "nominated as"
```

---

## 4. Auth & Tokens (`models/auth/`)

Stateless JWT access tokens + DB-backed refresh/reset/verify tokens. **Registration is
invite-only**: `RegistrationInvite` is the bridge between intake and a real account, and
it carries the user's eventual placement.

```mermaid
erDiagram
    USER ||--o{ REFRESH_TOKEN : "issues"
    USER ||--o{ PASSWORD_RESET_TOKEN : "requests"
    USER ||--o{ EMAIL_VERIFICATION_TOKEN : "requests"
    USER ||--o{ USER_SESSION : "opens"
    USER ||--o| TWO_FACTOR_AUTH : "secures"
    USER ||--o{ REGISTRATION_INVITE : "invited by (admin)"

    REGISTRATION_INVITE {
        uuid id PK
        string tokenHash UK
        string email "invite is email-bound"
        string role "mentor | mentee"
        uuid invitedBy FK
        uuid usedBy FK "set on register"
        datetime expiresAt
        datetime usedAt
        datetime revokedAt
        uuid programId FK "placement"
        uuid clanId FK "placement"
        uuid cohortId FK "intake batch"
        jsonb metadata
    }
    REFRESH_TOKEN {
        uuid id PK
        uuid userId FK
        string token UK
        datetime expiresAt
        datetime revokedAt
    }
    TWO_FACTOR_AUTH {
        uuid id PK
        uuid userId FK,UK
        string secret
        json backupCodes
        bool isVerified
    }
    USER_SESSION {
        uuid id PK
        uuid userId FK
        string sessionToken UK
        string deviceType
        datetime expiresAt
    }

    REGISTRATION_INVITE ||--o| PROGRAM : "places into"
    REGISTRATION_INVITE ||--o| CLAN : "places into"
    REGISTRATION_INVITE ||--o| COHORT : "from intake"
```

---

## 5. Programs, Cohorts & Clans (`models/programs/`)

A `Program` is the offering. A `Cohort` is a *season of intake* for that program (only
an `open` cohort accepts applications). A `Clan` is a mentor-led group of mentees inside
the program; `ClanMembership` records who is in it and in what role.

```mermaid
erDiagram
    PROGRAM {
        uuid id PK
        uuid createdBy FK
        string name
        string type "internship | mentorship | training | onboarding"
        string status "draft | published | archived | completed"
        string visibility "private | public"
        int maxEnrollments
        int currentEnrollments
    }
    COHORT {
        uuid id PK
        uuid programId FK
        string name
        string status "planning | open | closed | running | completed"
        int capacity
        date startDate
        date endDate
    }
    CLAN {
        uuid id PK
        uuid programId FK
        string name
        uuid leadMentorId FK
        int maxMentees
        string status "active | inactive | archived"
        string healthStatus "green | amber | red"
        string inviteSlug "shareable /join/<slug>"
        boolean inviteEnabled
    }
    CLAN_MEMBERSHIP {
        uuid id PK
        uuid clanId FK
        uuid userId FK
        string role "lead_mentor | co_mentor | mentee | core_team"
        string status "active | invited | removed"
        uuid enrollmentId FK "links mentee membership to enrollment"
    }
    CLAN_CHANGE_REQUEST {
        uuid id PK
        uuid menteeId FK
        uuid fromClanId FK
        uuid toClanId FK
        string status "pending | approved | denied"
    }
    CROSS_CLAN_ASSIGNMENT {
        uuid id PK
        string kind "cover | specialist | co_mentee_access"
        uuid userId FK
        uuid fromClanId FK
        uuid toClanId FK
    }
    ROADMAP {
        uuid id PK
        uuid programId FK
        string name
        bool isBaseRoadmap
        string source "org | local"
        uuid ownerMentorId FK "for local roadmaps"
        bool published
    }
    PROGRAM_REVIEW {
        uuid id PK
        uuid programId FK
        uuid reviewerId FK
        uuid mentorId FK
        decimal rating "0-5"
        jsonb dimensions
    }

    PROGRAM ||--o{ COHORT : "runs"
    PROGRAM ||--o{ CLAN : "divided into"
    PROGRAM ||--o{ ROADMAP : "defines"
    PROGRAM ||--o{ PROGRAM_REVIEW : "rated by"
    CLAN ||--o{ CLAN_MEMBERSHIP : "groups"
    USER ||--o{ CLAN_MEMBERSHIP : "member of"
    CLAN ||--o{ CLAN_CHANGE_REQUEST : "move target"
    USER ||--o| CLAN : "leads (lead mentor)"
```

---

## 6. Intake & Applications (`models/intake/`)

The intake layer. An `Application` is a person's request to join a cohort. Its free-form
answers live in `responses` (JSONB) so the intake form can change without migrations.
On accept, it spawns a `RegistrationInvite` and (once they register) links back to the
`User`.

```mermaid
erDiagram
    APPLICATION {
        uuid id PK
        uuid cohortId FK
        string email "unique per cohort"
        string firstName
        string lastName
        string programPreference
        string source "google_form | manual | import | api"
        string status "pending | assessment_sent | under_review | accepted | rejected | waitlisted"
        decimal assessmentScore
        text reviewerNotes
        uuid reviewedBy FK
        uuid inviteId FK "issued on accept"
        uuid userId FK "set when they register"
        jsonb responses "schema-free intake answers"
    }

    COHORT ||--o{ APPLICATION : "collects"
    APPLICATION ||--o| REGISTRATION_INVITE : "accepted to"
    APPLICATION ||--o| USER : "registered as"
    APPLICATION ||--o| USER : "reviewed by"
```

### Self-serve intake + assessments

A `Cohort` can expose a **public shareable link** (`publicSlug` + `publicEnabled`,
gated by `status='open'`, an optional `applyOpensAt`/`applyClosesAt` window, and a
`maxApplications` cap) and optionally attach an **Assessment** (`assessmentId` +
`assessmentRequired`). An `Application` carries an `accessTokenHash` magic-link so a
not-yet-registered applicant can return to track status and take the assessment without
an account. Assessments are admin-built, mixed-type, and (where possible) auto-graded.

```mermaid
erDiagram
    ASSESSMENT {
        uuid id PK
        uuid programId FK "optional scoping"
        string title
        string status "draft | published | archived"
        decimal passingScore
        int timeLimitMins
        uuid createdBy FK
    }
    ASSESSMENT_QUESTION {
        uuid id PK
        uuid assessmentId FK
        string type "mcq | multi_select | short_text | long_text | file_upload | external_link"
        text prompt
        int position
        bool required
        int points
        jsonb options "[{id,label}]"
        jsonb correctOptionIds "auto-grade key"
        jsonb config
    }
    ASSESSMENT_SUBMISSION {
        uuid id PK
        uuid assessmentId FK
        uuid applicationId FK
        jsonb answers
        decimal autoScore
        decimal manualScore
        decimal totalScore
        decimal maxScore
        string status "in_progress | submitted | graded"
        uuid gradedBy FK
    }

    COHORT ||--o| ASSESSMENT : "attaches (optional)"
    ASSESSMENT ||--o{ ASSESSMENT_QUESTION : "has"
    ASSESSMENT ||--o{ ASSESSMENT_SUBMISSION : "collects"
    APPLICATION ||--o{ ASSESSMENT_SUBMISSION : "submits"
    PROGRAM ||--o{ ASSESSMENT : "scopes (optional)"
```

---

## 7. Roadmaps & Tasks (`models/tasks/`)

The execution engine. An `Enrollment` is the mentee↔program link and the unit of
progress. `RoadmapTask` is a template step; `AssignedTask` is an instance handed to a
specific mentee. Submissions are versioned; feedback attaches to a submission version.

```mermaid
erDiagram
    ENROLLMENT {
        uuid id PK
        uuid menteeId FK
        uuid programId FK
        uuid cohortId FK
        string status "pending_approval | pending_match | matched | active | pending_completion | program_completed | dropped"
        int tasksCompleted
        int tasksTotal
        decimal overallProgressPercentage
    }
    ROADMAP_TASK {
        uuid id PK
        uuid roadmapId FK "null = custom assignment"
        string title
        string type "reading | video | exercise | project | quiz | assessment | custom | ..."
        string difficulty "easy | medium | hard | expert"
        int taskOrder
        text deliverable
        int pointsBase
    }
    ASSIGNED_TASK {
        uuid id PK
        uuid roadmapTaskId FK
        uuid menteeId FK
        uuid mentorId FK
        uuid enrollmentId FK
        uuid trackId FK
        string status "assigned | in_progress | submitted | revision_needed | completed | cancelled"
        datetime dueDate
        int pointsAwarded
    }
    TASK_SUBMISSION {
        uuid id PK
        uuid assignedTaskId FK
        int version
        text submissionText
        string status "pending | approved | revision_needed | reviewing"
        bool extensionRequested
    }
    TASK_SUBMISSION_FILE {
        uuid id PK
        uuid submissionId FK
        string fileName
        text fileUrl
    }
    TASK_FEEDBACK {
        uuid id PK
        uuid assignedTaskId FK
        uuid submissionId FK
        uuid mentorId FK
        decimal rating "0-5"
        bool isApproved
        string decision "approved | approved_notes | changes | rejected"
        jsonb inlineFeedback
    }
    TASK_RESOURCE {
        uuid id PK
        uuid roadmapTaskId FK
        string title
        text url
    }
    TASK_SKILL {
        uuid id PK
        uuid roadmapTaskId FK
        uuid skillId FK
    }
    ROADMAP_PROGRESS {
        uuid id PK
        uuid roadmapId FK
        uuid menteeId FK
        uuid enrollmentId FK
        int currentStep
    }
    MENTOR_MENTEE_MATCH {
        uuid id PK
        uuid mentorId FK
        uuid menteeId FK
        uuid enrollmentId FK
        string status "pending | active | completed | cancelled"
    }
    BLOCKER {
        uuid id PK
        uuid menteeId FK
        uuid assignedTaskId FK
        string severity "low | medium | high"
        string status "open | resolved"
    }
    DELAY_EVENT {
        uuid id PK
        uuid menteeId FK
        uuid assignedTaskId FK
        string kind "job | health | connectivity | ..."
        int days
        bool accepted
    }
    DAILY_LOG_ENTRY {
        uuid id PK
        uuid menteeId FK
        string dateKey "YYYY-MM-DD"
        uuid[] tasksDone
    }
    TRACK {
        uuid id PK
        uuid menteeId FK
        string name
        string source "blank | template | program"
    }

    ROADMAP ||--o{ ROADMAP_TASK : "ordered steps"
    ROADMAP_TASK ||--o{ ASSIGNED_TASK : "instantiated as"
    ROADMAP_TASK ||--o{ TASK_RESOURCE : "links"
    ROADMAP_TASK ||--o{ TASK_SKILL : "teaches"
    ENROLLMENT ||--o{ ASSIGNED_TASK : "scopes"
    ENROLLMENT ||--o{ MENTOR_MENTEE_MATCH : "matched via"
    ASSIGNED_TASK ||--o{ TASK_SUBMISSION : "submitted"
    TASK_SUBMISSION ||--o{ TASK_SUBMISSION_FILE : "attaches"
    TASK_SUBMISSION ||--o{ TASK_FEEDBACK : "reviewed by"
    ASSIGNED_TASK ||--o{ BLOCKER : "blocked by"
    ASSIGNED_TASK ||--o{ DELAY_EVENT : "delayed by"
    TRACK ||--o{ ASSIGNED_TASK : "groups"
    USER ||--o{ ENROLLMENT : "enrolled as mentee"
```

> `Enrollment` progress (`tasksTotal`, `tasksCompleted`, `overallProgressPercentage`,
> `status`) is recomputed by `taskService.updateEnrollmentTaskStats` on every
> assign/submit/review - it is the **single source of truth** for progress. Total counts
> live (non-cancelled) assigned tasks, not the template, so progress never shows a false 100%.

### Roadmap chaining (`roadmap_links`, migration 053)

Roadmaps form a **directed graph** of "what comes next", authored once and reused:

```
ROADMAP_LINK {
  uuid id PK
  uuid fromRoadmapId FK
  uuid toRoadmapId FK
  int  position
  jsonb condition   "reserved for score/choice gating; null = always"
}
```

When a mentee finishes a roadmap (`RoadmapProgress.completed`), `linearRoadmapService._advanceChain`
resolves the outgoing links: **one edge + `enrollments.auto_advance_roadmaps` on → auto-assign
the next** (and notify the mentor via `ROADMAP_ADVANCED`); **several edges, or auto-off → notify
the mentor to pick** (no silent auto-assign). The graph is kept a **DAG** — `setNextLinks` rejects
self-links and cycles. `enrollments.auto_advance_roadmaps` (BOOLEAN, default true) is the per-mentee
off switch; mentors can also `manualAdvance` to any roadmap (pick-from-branch / skip).

---

## 8. Messaging (`models/messaging/`)

Real-time 1:1 chat over Socket.IO plus a notification feed. Messages carry WhatsApp-style
receipts (`deliveredAt`, `readAt`) and emoji `reactions`.

```mermaid
erDiagram
    CONVERSATION {
        uuid id PK
        string type "direct | system"
        uuid lastMessageId FK
        datetime lastMessageAt
        uuid relatedTaskId FK
        uuid relatedEnrollmentId FK
    }
    CONVERSATION_PARTICIPANT {
        uuid id PK
        uuid conversationId FK
        uuid userId FK
        uuid lastReadMessageId FK
        datetime lastReadAt
    }
    MESSAGE {
        uuid id PK
        uuid senderId FK
        uuid recipientId FK
        uuid threadId FK "conversation"
        text messageText
        bool isRead
        datetime readAt
        datetime deliveredAt
    }
    MESSAGE_ATTACHMENT {
        uuid id PK
        uuid messageId FK
        string fileName
        text fileUrl
    }
    MESSAGE_REACTION {
        uuid id PK
        uuid messageId FK
        uuid userId FK
        string emoji "one per user per message"
    }
    NOTIFICATION {
        uuid id PK
        uuid userId FK
        string type "task | feedback | badge | milestone | message | system | challenge"
        string title
        string status "unread | read | archived"
        string actionUrl
    }

    CONVERSATION ||--o{ CONVERSATION_PARTICIPANT : "has"
    CONVERSATION ||--o{ MESSAGE : "contains"
    USER ||--o{ MESSAGE : "sends / receives"
    MESSAGE ||--o{ MESSAGE_ATTACHMENT : "carries"
    MESSAGE ||--o{ MESSAGE_REACTION : "reacted with"
    USER ||--o{ NOTIFICATION : "receives"
```

---

## 9. Gamification (`models/gamification/`)

Points, badges, challenges, leaderboards, and an XP-priced gift catalog.

```mermaid
erDiagram
    BADGE {
        uuid id PK
        string name UK
        string criteriaType
        jsonb criteriaValue
        int pointsReward
    }
    USER_BADGE {
        uuid id PK
        uuid userId FK
        uuid badgeId FK
        datetime unlockedAt
    }
    CHALLENGE {
        uuid id PK
        string type "speed | quality | consistency | custom"
        int pointsReward
        uuid badgeReward FK
    }
    USER_CHALLENGE {
        uuid id PK
        uuid userId FK
        uuid challengeId FK
        decimal progressPercentage
        bool isCompleted
    }
    POINTS_HISTORY {
        uuid id PK
        uuid userId FK
        int pointsChange
        string sourceType
    }
    LEADERBOARD_ENTRY {
        uuid id PK
        uuid userId FK
        uuid programId FK
        int rank
        int points
        string periodType
    }
    GIFT {
        uuid id PK
        string name
        int costXp
        int stock "null = infinite"
    }
    REDEMPTION {
        uuid id PK
        uuid giftId FK
        uuid menteeId FK
        int costXp "snapshot"
    }

    USER ||--o{ USER_BADGE : "earns"
    BADGE ||--o{ USER_BADGE : "awarded as"
    CHALLENGE ||--o{ USER_CHALLENGE : "entered as"
    USER ||--o{ USER_CHALLENGE : "joins"
    USER ||--o{ POINTS_HISTORY : "accrues"
    USER ||--o{ LEADERBOARD_ENTRY : "ranked in"
    GIFT ||--o{ REDEMPTION : "redeemed as"
    USER ||--o{ REDEMPTION : "redeems (mentee)"
    CHALLENGE ||--o| BADGE : "rewards"
```

---

## 10. Scheduling (`models/scheduling/`)

Mentor availability, booked meetings, post-meeting notes, and reusable schedule templates.

```mermaid
erDiagram
    AVAILABILITY_SLOT {
        uuid id PK
        uuid mentorId FK
        date date
        string time
        int durationMins
        bool taken
        uuid takenBy FK
    }
    SCHEDULED_MEETING {
        uuid id PK
        uuid mentorId FK
        uuid menteeId FK
        uuid availabilitySlotId FK
        string kind "1:1 | standup | review | pairing"
        string status "scheduled | done | cancelled"
        text cancellationReason
    }
    MEETING_NOTE {
        uuid id PK
        uuid menteeId FK
        uuid mentorId FK
        uuid scheduledMeetingId FK
        text summary
        string sentiment "positive | neutral | low"
    }
    SCHEDULE_TEMPLATE {
        uuid id PK
        string name
        string source "org | mentor"
        jsonb blocks
    }
    MENTEE_SCHEDULE {
        uuid id PK
        uuid menteeId FK,UK
        uuid templateId FK
        jsonb schedule
    }

    USER ||--o{ AVAILABILITY_SLOT : "offers (mentor)"
    AVAILABILITY_SLOT ||--o| SCHEDULED_MEETING : "booked as"
    USER ||--o{ SCHEDULED_MEETING : "mentor / mentee"
    SCHEDULED_MEETING ||--o{ MEETING_NOTE : "documented by"
    SCHEDULE_TEMPLATE ||--o{ MENTEE_SCHEDULE : "instantiated as"
    USER ||--o| MENTEE_SCHEDULE : "follows (mentee)"
```

---

## 11. Analytics (`models/analytics/`)

Pre-computed rollups (refreshed by scheduled jobs) plus raw activity/event streams.
These are mostly read-only reporting tables keyed by entity + period.

```mermaid
erDiagram
    ANALYTICS_EVENT {
        uuid id PK
        uuid userId FK
        string eventType
        jsonb eventData
    }
    ACTIVITY_SESSION {
        uuid id PK
        uuid userId FK
        date date
        int activeMinutes
    }
    SKILL_ASSESSMENT {
        uuid id PK
        uuid userId FK
        uuid skillId FK
        int proficiencyLevel "0-100"
        uuid basedOnTaskId FK
    }
    TASK_ANALYTICS {
        uuid id PK
        uuid roadmapTaskId FK
        decimal completionRate
        decimal avgRating
    }
    MENTEE_ANALYTICS {
        uuid id PK
        uuid menteeId FK
        uuid enrollmentId FK
        decimal overallProgressPercentage
    }
    MENTOR_ANALYTICS {
        uuid id PK
        uuid mentorId FK
        decimal approvalRate
    }
    PROGRAM_ANALYTICS {
        uuid id PK
        uuid programId FK
        decimal completionRate
    }
    ADAPTIVE_RECOMMENDATION {
        uuid id PK
        uuid menteeId FK
        uuid enrollmentId FK
        jsonb recommendedChanges
        bool generatedByAi
    }

    USER ||--o{ ANALYTICS_EVENT : "emits"
    USER ||--o{ ACTIVITY_SESSION : "logs"
    USER ||--o{ SKILL_ASSESSMENT : "assessed in"
    SKILL ||--o{ SKILL_ASSESSMENT : "measured by"
    ROADMAP_TASK ||--o{ TASK_ANALYTICS : "summarized by"
    ENROLLMENT ||--o{ MENTEE_ANALYTICS : "summarized by"
    PROGRAM ||--o{ PROGRAM_ANALYTICS : "summarized by"
    ENROLLMENT ||--o{ ADAPTIVE_RECOMMENDATION : "suggests for"
```

---

## 12. System & Community feed (`models/system/`)

Cross-cutting platform tables: the scoped community feed (clan/cohort/program/global),
announcements, settings, audit, file uploads, the Mentor Spec handbook (`OrgPolicy`), and
bring-your-own-key AI connections.

```mermaid
erDiagram
    ANNOUNCEMENT {
        uuid id PK
        uuid authorId FK
        string audience "all | mentors | mentees | program | clan"
        uuid audienceId
        bool pinned
    }
    ANNOUNCEMENT_REACTION {
        uuid id PK
        uuid announcementId FK
        uuid userId FK
        string type "acknowledged | helpful"
    }
    COMMUNITY_POST {
        uuid id PK
        uuid authorId FK
        string type "kudos | win | question | discussion | resource | meme | standup"
        string scopeType "clan | cohort | program | global"
        uuid scopeId
        text body
        bool resolved
    }
    COMMUNITY_COMMENT {
        uuid id PK
        uuid postId FK
        uuid authorId FK
        uuid parentId FK "threaded"
    }
    COMMUNITY_REACTION {
        uuid id PK
        uuid postId FK
        uuid userId FK
        string type "cheers | celebrate | helpful | insightful"
    }
    COMMUNITY_REPORT {
        uuid id PK
        string targetType "post | comment"
        uuid targetId
        uuid reporterId FK
        string status "open | reviewed | dismissed"
    }
    USER_SETTINGS {
        uuid id PK
        uuid userId FK,UK
        string theme "light | dark"
        string colorTheme "accent vibe"
        jsonb emailNotifications
    }
    AI_CONNECTION {
        uuid id PK
        string provider "groq | openai | anthropic | gemini | custom"
        text keyEncrypted
        uuid ownerId "null = org-wide"
    }
    FILE_UPLOAD {
        uuid id PK
        uuid uploadedBy FK
        string fileUrl
        string relatedEntityType
    }
    AUDIT_LOG {
        uuid id PK
        uuid userId FK
        string action
        string entityType
        jsonb newValues
    }

    USER ||--o{ ANNOUNCEMENT : "authors"
    ANNOUNCEMENT ||--o{ ANNOUNCEMENT_REACTION : "acked via"
    USER ||--o{ COMMUNITY_POST : "posts"
    COMMUNITY_POST ||--o{ COMMUNITY_COMMENT : "discussed in"
    COMMUNITY_POST ||--o{ COMMUNITY_REACTION : "reacted to"
    COMMUNITY_COMMENT ||--o{ COMMUNITY_COMMENT : "replies to"
    USER ||--o| USER_SETTINGS : "configures"
    USER ||--o{ FILE_UPLOAD : "uploads"
    USER ||--o{ AUDIT_LOG : "acts in"
```

> Other system tables not drawn (no foreign-key relationships, or singletons):
> `Document`, `OrgPolicy`, `EmailQueue`, `SuppressedEmail`, `ScheduledJob`, `SystemSettings`.

> **`EmailQueue` is a real queue, not just a log** (migration 052): `status`
> (`pending → sending → sent | dead`), `attempt_count`/`max_attempts`, `next_attempt_at`
> (backoff), `idempotency_key` (unique), `error_category`, `provider_message_id`. Processed by
> `workers/emailWorker.js`. **`SuppressedEmail`** (email, reason `bounce|complaint|manual`) is
> populated by the Resend webhook (`POST /webhooks/resend`); the worker refuses to send to a
> suppressed address. See [Notifications & Email](./features/notifications-and-email.md).

---

## 13. Migrations

Schema changes are idempotent, numbered scripts in
[`server/scripts/migrations/`](../server/scripts/migrations) (`NNN_description.js`, each
with `up`/`down`, run with `--rollback` to reverse). The latest is **053**. Notable ones:

| # | What it added |
| --- | --- |
| 005 | Registration invites |
| 007 | Capabilities & clans |
| 030 | Private programs + invite placement |
| 031 | Intake cohorts & applications |
| 032 | Community v2 (scoped posts, reactions, reports) |
| 035-036 | AI connections (bring-your-own-key) |
| 037 | Program reviews |
| 040-041 | User color theme + preferences |
| 042 | Message delivery receipts + reactions |
| 043 | Public intake links + assessments (cohort link/window/cap, applicant magic-link, assessment tables) |
| 044 | Role assignments (scoped RBAC grants) |
| 047 | Cross-clan cover (consent-first co-mentor grants) |
| 050 | Cohort-review attendance on meeting notes |
| 051 | Scheduling timezones (`starts_at`/`timezone` on slots & meetings; `timezone` on templates/mentee schedules) |
| 052 | Email-queue resilience (retry/backoff, DLQ, idempotency, `provider_message_id`) + `suppressed_emails` |
| 053 | Roadmap chaining (`roadmap_links` graph + `enrollments.auto_advance_roadmaps`) |
| 093 | Clan reusable invite link (`invite_slug` + `invite_enabled`) |

> **First deploy note:** `npm run db:sync` builds the full schema from the models in one
> shot (the models already encode every migration's end state), so a brand-new database does
> **not** need to replay these. The numbered migrations are for evolving an *existing* DB.

Run all pending migrations against your DB with the project's migration runner (see
[`server/DATABASE_SETUP.md`](../server/DATABASE_SETUP.md)).

---

*Keep this document honest:* when you add or change a model, update the relevant diagram
and the domain map. A diagram that lies is worse than no diagram.
