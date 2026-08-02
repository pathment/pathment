# Pathment - Architecture (Zero to Hero)

> Read this once and you'll understand how the whole system fits together: the apps, how
> a request flows, how people get in and do work, and the patterns every contributor is
> expected to follow. Pair it with [DATABASE.md](./DATABASE.md) for the data model.

---

## 1. What Pathment is

Pathment is a **structured mentorship platform**. Organizations run **programs**;
people **apply** into a **cohort** (a season of intake), get **placed** into a
mentor-led **clan**, and work through a **roadmap** of **tasks** that mentors review.
Layered on top: real-time messaging, a scoped community feed, gamification (points,
badges, leaderboards, gifts), scheduling, and analytics.

Three roles, capability-aware so one account can hold several:

- **Admin** - runs intake, creates programs/cohorts/clans, invites users, oversees everything.
- **Mentor** - leads a clan, assigns and reviews tasks, mentors mentees, holds 1:1s.
- **Mentee** - works the roadmap, submits tasks, participates in the community.

---

## 2. The monorepo

```
pathment/
├── server/            # Backend API - Node.js + Express + Sequelize + PostgreSQL + Socket.IO
├── client-interface/  # The product app - Next.js (App Router) + React + Tailwind v4
├── marketing-site/    # Public landing page - Next.js (apex domain)
└── docs/              # This documentation
```

| App | Stack | Port (dev) |
| --- | --- | --- |
| `server` | Express 4, Sequelize 6, PostgreSQL, JWT, Socket.IO, Bull + Redis, Resend (email) | `5000` |
| `client-interface` | Next.js 16, React 19, TypeScript, Tailwind v4, Axios, socket.io-client | `3000` |
| `marketing-site` | Next.js 16, React 19, Tailwind | `3001` |

---

## 3. How a request flows (server)

The backend is a classic layered Express app. Every feature follows the same path:

```
HTTP request
  → routes/        (URL + middleware: authenticate, authorize, validate)
    → controllers/ (thin: parse req, call a service, shape the HTTP response)
      → services/  (ALL business logic + transactions live here)
        → models/  (Sequelize - the only thing that touches the DB)
          → PostgreSQL
```

**Rules of the layering:**

- **Controllers stay thin.** They call `successResponse(...)`, wrap handlers in
  `catchAsync`, and never contain business logic.
- **Services own the logic.** Transactions, validation beyond shape, cross-model writes,
  and emitting socket events / queueing jobs all happen in services. Most are exported as
  singletons (`module.exports = new XService()`).
- **Models are loaded automatically.** `server/src/db/index.js` walks `src/models/**`,
  registers every model, then runs each model's `associate()`. You never wire models
  manually - drop a file in the right domain folder and it's live.
- **Validation** uses Joi schemas in `src/validations/`, applied via
  `validateBody/validateParams/validateQuery` middleware.
- **Errors** are typed (`NotFoundError`, `ValidationError`, `ConflictError`,
  `ForbiddenError`, …), each carrying a **stable `code`**, and turned into HTTP responses by
  the central error handler (see *Error handling* below).

### Error handling & observability

One consistent envelope for **every** failure:

```json
{ "success": false, "message": "Validation failed", "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "errors": [{ "field": "email", "message": "A valid email is required" }],
  "requestId": "9f1c…" }
```

- **Typed errors → codes.** `AppError(message, status, code)` (`src/utils/errors/`); subclasses
  set the code (`NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `VALIDATION_ERROR`, …). Clients branch
  on `code`, never on the message. Field errors come back as `errors[]` (Joi *and* Sequelize
  validation now share that shape).
- **Correlation id.** `requestContext` mints a `requestId` per request → `X-Request-Id` header,
  the error body, and every log line (via the AsyncLocalStorage context). "It broke" becomes one
  greppable id.
- **Operational vs programmer split.** The central handler (`middlewares/errorHandler.js`) logs
  5xx with a stack via the structured logger (`utils/logger.js` — JSON lines in prod, flagged
  `unexpected:true` for real bugs, ready to ship to a log aggregator). In production an
  unexpected 5xx returns a generic message — **internals/stack never leak**; dev gets the stack.
- **Client boundaries.** Next `app/error.tsx` + per-role `error.tsx` (keep the sidebar) +
  `app/global-error.tsx` so a thrown component degrades *locally* (`components/shared/ErrorView`:
  retry / go-home / show the reference id) instead of white-screening. Helpers: `extractApiErrorMessage`,
  `getErrorCode`, `getRequestId`, `getRateLimit` (`lib/utils/api-error.ts`).

### Auth

- **Login** issues a short-lived **JWT access token** + a DB-backed **refresh token**
  (7-day, revocable). Tokens carry `{ id, email, role }`.
- **`authenticate`** middleware verifies the JWT, loads the user, and checks the account
  is active + email-verified.
- **`authorize([roles])`** is **capability-aware**: a user passes if *any* of their
  `capabilities` (a superset array that always includes their primary `role`) matches.
  That's how one person can be both a mentee and an admin.
- **2FA** is supported: when enabled, login returns a 5-minute temporary token and the
  client completes with a 6-digit code.

---

## 4. The core life-cycle (how someone becomes a working mentee)

This is the spine of the product. (See the matching diagram in
[DATABASE.md §2](./DATABASE.md#2-the-spine--core-entities-at-a-glance).)

1. **Apply** → an `Application` is created in an **open** `Cohort` of a `Program`.
   The applicant's answers live in `Application.responses` (JSONB), so the intake form
   can evolve without migrations.
2. **Review & accept** → an admin reviews applications (with notes + an optional
   `assessmentScore`). Accepting calls `applicationService.acceptApplication`, which
   issues a `RegistrationInvite` carrying `programId` + optional `clanId` + `cohortId`.
3. **Register** → the invite is **email-bound** and consumed at `/register?invite=…`.
   `authService` creates the `User` (+ role profile + settings), marks the email
   pre-verified (the invite proves it), and - for mentees - creates:
   - an `Enrollment` (program + cohort lineage), and
   - a `ClanMembership` (if the invite named a clan), linked to the enrollment.
4. **Work** → the program's `Roadmap` → `RoadmapTask`s are handed out as `AssignedTask`s.
   The mentee files versioned `TaskSubmission`s; the mentor leaves `TaskFeedback`
   (approve / approve-with-notes / request-changes / reject).
5. **Progress** → `taskService.updateEnrollmentTaskStats` recomputes the enrollment's
   `tasksTotal / tasksCompleted / overallProgressPercentage / status` on every
   assign/submit/review. **This is the single source of truth for progress** - totals are
   based on live (non-cancelled) assigned tasks, so completion can never falsely read 100%.
6. **Complete** → when all tasks are done the mentor confirms completion (mentee can't
   self-complete), which can trigger anonymous structured program feedback.

**Visibility gating:** programs are `private` by default; only `published` + `public`
programs appear to non-admins. Community spaces and most data are gated by clan/cohort/
program membership - a person sees the org's content only once they're placed.

> **Self-serve intake:** steps 1-2 also work without an admin importing anyone. A cohort
> can publish a **shareable apply link** (`publicSlug`, gated by status/window/cap), and the
> public **program catalog** (`/programs`) lets visitors browse published programs and apply.
> Applicants use an **email magic-link** (`Application.accessTokenHash`) to track status and
> complete an optional, admin-built **assessment** (mixed-type: MCQ auto-graded, text, file,
> link) before review - see `publicIntakeService` + `assessmentService`. No account is created
> until they're accepted and register via the invite.

---

## 5. Real-time (Socket.IO)

- Initialized in [`server/src/socket/index.js`](../server/src/socket/index.js); the client
  connects with its JWT.
- **Rooms:** every user joins `user:{id}`; chat participants join `conversation:{id}`.
- **Helpers:** `emitToUser`, `emitToConversation`, `isUserOnline`.
- **Used for:** new messages (`message:new`), delivery/read receipts
  (`message:delivered`, `conversation:read`), message reactions (`message:reaction`),
  and live notification badges. Messages are delivered the moment a recipient is online,
  and marked delivered on their next connect otherwise.

---

## 6. Background jobs & email

- **Email is a Postgres-backed queue** (`email_queue` + `workers/emailWorker.js`, started in
  `server/src/index.js`). Everything enqueues via `emailService.enqueue` (the notification
  orchestrator no longer sends inline); the worker polls due rows and delivers via Resend with
  **categorised retry + backoff**, a **dead-letter** (`status='dead'`) state, **idempotency**, a
  **suppression list** (`suppressed_emails`, fed by the Resend bounce/complaint webhook at
  `POST /webhooks/resend`), and an admin view at `/admin/emails`. This was a deliberate move
  off Bull/Redis so volume stays inside the Upstash command budget (see article 18).
- **Scheduled work** runs in-process: `notificationScheduler` (deadline reminders, weekly
  digests) + the email-worker poll loop; `scheduled_jobs` table backs periodic maintenance.

---

## 7. AI integration

- Roadmaps and narrative/report drafting use an LLM through a small service layer
  (`groqService.generateText` is the generic completion primitive).
- **Bring-your-own-key:** `AIConnection` stores encrypted provider keys (groq / openai /
  anthropic / gemini / custom). A key can be org-wide (`ownerId` null) or a mentor's
  personal key. Adaptive roadmap recommendations are persisted as
  `AdaptiveRecommendation` rows for human review before they're applied.

---

## 8. The client (`client-interface`)

- **Next.js App Router**, organized **role-first → feature-second**:
  `app/(auth)/…`, `app/admin/…`, `app/mentor/…`, `app/mentee/…`, plus shared
  `components/`, `lib/` (api, context, hooks, services, types, utils).
- **API access** is centralized in `lib/services/*-api.ts` over a shared Axios
  `apiClient` (injects the JWT, unwraps `{ data }`). Components call these services, not
  Axios directly.
- **RBAC on the client** uses a `RoleGuard`; routes/nav adapt to the user's capabilities.
- **Theming (Tailwind v4, CSS-first):** `styles/globals.css` `@theme inline` is
  authoritative. A centralized `brand-*` token scale drives all accent color, so the whole
  app re-skins by swapping CSS vars. Per-user accent "vibe" presets set
  `html[data-accent="…"]`; dark mode overrides `--color-slate-*` under `.dark`.
  **Never hardcode `indigo-*`** - use `brand-*`.
- **Shared Drawer** (`components/shared/Drawer.tsx`) is the standard accessible
  side-drawer for forms that "ask" the user something.

---

## 9. Conventions every contributor should follow

- **Server:** new feature = route → controller → service → model. Keep controllers thin,
  put logic in services, use typed errors, validate with Joi.
- **Migrations:** add an idempotent numbered script in `server/scripts/migrations/`
  (`up`/`down`, supports `--rollback`). Never edit a shipped migration; add a new one.
  Bump from the current highest number (042).
- **Client:** add API calls in the right `lib/services/*-api.ts`, type payloads in
  `lib/types/`, and reuse shared components. Match the surrounding code's style.
- **Color:** `brand-*` only; respect dark mode by relying on the slate token overrides.
- **Verification before you call something done:**
  - Client: `npx tsc --noEmit` and `npm run build`.
  - Server: a quick load check (`node -e "require('dotenv').config(...); require('./src/...')"`)
    and, where logic is non-trivial, a self-cleaning synthetic test in `server/scripts/test-*.js`.
- **Commits:** focused, on a feature branch, PR'd against `staging` (see
  [CONTRIBUTING.md](../CONTRIBUTING.md)).

---

## 10. Running it locally (the short version)

```bash
# 1. Server
cd server
npm install
cp .env.example .env          # fill DB url, JWT secrets, AI + Resend keys
npm run db:create             # create + sync schema  (see DATABASE_SETUP.md)
npm run seed:admin            # create the first admin
npm run dev                   # http://localhost:5000

# 2. Client
cd ../client-interface
npm install
cp .env.example .env.local    # NEXT_PUBLIC_API_URL=http://localhost:5000/api
npm run dev                   # http://localhost:3000
```

Full details, env var reference, and troubleshooting live in the root
[README.md](../README.md), [server/README.md](../server/README.md), and
[server/DATABASE_SETUP.md](../server/DATABASE_SETUP.md).

---

## 11. Where to look next

| You want to… | Start here |
| --- | --- |
| Understand a specific feature (per role) | [docs/features/](./features/README.md) |
| Understand the data | [docs/DATABASE.md](./DATABASE.md) |
| Add a backend feature | `server/src/routes` → `controllers` → `services` → `models` |
| Add a screen | `client-interface/app/{role}/…` + `lib/services/*-api.ts` |
| Understand intake/registration | `services/applicationService.js`, `cohortIntakeService.js`, `authService.js` |
| Understand tasks/progress | `services/taskService.js`, `submissionService.js` |
| Understand real-time | `server/src/socket/index.js`, `client-interface/components/shared/messages/` |
| Understand cohort-review **live video** (Jitsi) | [docs/COHORT-REVIEW-VIDEO.md](./COHORT-REVIEW-VIDEO.md) — self-hosted Jitsi + attendance/talk-time flows, all files |
| API reference | [server/docs/API_DOCUMENTATION.md](../server/docs/API_DOCUMENTATION.md) |
