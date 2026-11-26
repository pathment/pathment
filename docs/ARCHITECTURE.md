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
└── docs/              # This documentation
```

The marketing site lives in a **separate repository** (`pathment/pathment-marketing`,
git remote `marketing`), and the mobile app in a private one. Older passages in
`CONTRIBUTING.md` and `docs/SETUP.md` still describe `marketing-site/` as a folder here
— it is not. See [MAP.md](./MAP.md#known-documentation-drift).

| App | Stack | Port (dev) |
| --- | --- | --- |
| `server` | Express 4, Sequelize 6, PostgreSQL, JWT, Socket.IO, Postgres-backed job queues, Resend (email) | `5000` |
| `client-interface` | Next.js 16, React 19, TypeScript, Tailwind v4, Axios, socket.io-client | `3000` |

> There is **no Redis and no Bull** in `server/package.json`. Queues are Postgres tables
> claimed with `FOR UPDATE SKIP LOCKED` — see §6 and
> [decisions/0001](./decisions/0001-postgres-is-the-job-queue.md).

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

### Portal scope (which hat is the caller wearing?)

One account can hold several roles at once - lead mentor of one clan, co-mentor of a
second, learner in a third. Authorization answers *may I*; it does not answer *which of
my roles is this question about*. Without that second answer every "my stuff" endpoint
replied with the **union** of every hat, so a mentor's own Roadblocks page listed their
mentees' roadblocks and their mentee inbox listed the threads they hold as a mentor.

The portal now travels with the request:

| Header | Value | Set from |
| --- | --- | --- |
| `X-Portal-Role` | `mentee` \| `mentor` \| `admin` | the URL prefix (`/mentee/...`) |
| `X-Active-Clan` | a clan uuid | the mentor clan selector (`ClanContext`) |

- **Client:** `lib/services/portal-scope.ts` builds the headers; both axios clients inject
  them on every request. It reads the pathname rather than React state so the interceptors
  (which sit outside the component tree) can use it - the same rule the notification bell
  already uses (`roleFromPathname`).
- **Server:** `middlewares/portalScope.js` parses them into `req.portal` (parse only - no
  DB, no I/O). `authzService.menteeIdsForPortal(user, portal)` turns that into "who is this
  page about": the caller alone in the mentee portal, their mentees (optionally one clan)
  in the mentor portal, `null` for no narrowing.

**It can only ever narrow.** `req.portal` is a stated preference, not a grant: every
consumer still runs the authorization it ran before, and a portal the user does not
actually hold resolves to nothing rather than to more. A request with no portal header
(an older client, a script, a test) behaves exactly as it did - so adopting it on a new
endpoint is additive, and client and server can ship in either order.

Consumers today: `frictionService` (blockers + delays), `messagingService.listConversations`,
`frictionController.targetMenteeId`. Reach for it on any new endpoint that answers a
question about "me" rather than about a named resource.

### Programme scope (an admin of *what*?)

The portal answers *which of my roles is this about*. It does not answer *how much of the
workspace does that role cover*, and admin rights are grantable at **programme** scope -
`program_admin` bound to Fellowship 2026 and nothing else.

Every scope leak this codebase has had was the same mistake made in a different file: a
service asking `actsAsAdmin(user)` - "is this person an admin?" - and stopping there, when
the answer can be "of one programme". The permission checks were right from the start; the
**reads** were not. Certificates listed every programme's templates, community listed every
programme's spaces, the chat directory listed all 1,089 members of the organisation, review
records returned 300 sessions from programmes the caller had no access to. Each surface had
derived "my programmes" itself, slightly differently, so fixing one left the others leaking.

**One resolver:** `authzService.programScopeFor(user, portalRole)` →

```js
{ unrestricted: true }               // an ORG-tier admin wearing the admin hat
{ programIds: [...], clanIds: [...] } // everybody else, already deduped
```

- Resolved **on every read**, never stored. Somebody can be an org admin at nine and an
  admin of one programme at ten; shrinking a grant has to take effect at ten, which it
  cannot do if the answer was written into a row.
- The **hat narrows it**, as with `actsAsAdmin`: an admin of one programme who also mentors
  a clan and learns in a third gets a different bound on each screen, and all three are true.
  No hat stated anywhere → the union of everything they hold.
- `clanIds` is **not** "the clans of `programIds`", except for an admin. An admin *of* a
  programme oversees every clan in it; a mentee enrolled in the same programme does not,
  and expanding their programme back into clans would hand them every sibling clan's content.
- Companions: `clanIdsInPrograms(programIds)`, and `adminUserIdsFor(programIds)` for "the
  admins this person may always reach" - every org admin plus the admins *of* those
  programmes. Org admins stay reachable from every scope deliberately: being limited to one
  programme is a reason to **need** an org admin, not a reason to be cut off from one.

Two rules that keep the bound honest when applied to things people already have:

- **Hide, never delete.** An out-of-scope chat thread drops out of the inbox and nothing
  about it is touched, so restoring the access brings it straight back.
- **Never hide what you cannot classify.** The filters are stated as "exclude the ones that
  provably belong elsewhere", not "keep the ones that provably belong here". An inclusion
  list silently drops every record the model cannot place - an admin on a legacy base role,
  somebody with no clan and no enrolment - and an inbox that quietly loses threads is worse
  than one showing a thread too many.

Reach for `programScopeFor` on any new read that lists more than one programme's worth of
anything. Do not re-derive it.

### Announcement visibility is bounded in time, too

Announcements are targeted at an audience (`all` / `mentors` / `mentees` / `program:<id>` /
`clan:<id>`), and visibility used to be pure set membership: *are you in programme X right
now?* With no sense of time in the query, somebody who enrolled this morning read eight
months of a previous cohort's logistics - "Demo Day is complete, well done everyone" - and
the enrolment lookup had no status filter at all, so a mentee who dropped out kept receiving
new posts for ever.

Each audience arm now carries the viewer's own **window** on it:

- **Floor** = the earliest moment they were connected to that audience: the enrolment for a
  programme, the workspace membership for the org-wide audiences. Anchored on the
  **programme**, never on the clan join - re-homing a mentee into a standing clan writes a
  fresh `clan_memberships` row, and anchoring on that would erase months of their own clan's
  history on the day an admin approves the move.
- **Ceiling** = only when *every* enrolment in the programme has ended. One live enrolment
  means they are current: somebody who dropped a cohort and joined the next one is not an
  alumnus. An alumnus keeps the history they could already read and stops receiving new
  posts - but their **clan** posts are unaffected, because a standing clan is where alumni
  live and membership of it is a live relationship.
- **`pinned` escapes the floor**, and that is the whole design. The pin already existed,
  already sorted first and already meant "this outlives the moment", so it is what carries
  the handbook posts - code of conduct, how to submit work, office hours - to everybody who
  joins later. No new column, no new choice in the compose form.
- **Admins get no window.** A mentee reads announcements to know what is happening; an admin
  reads them as a record of what their programme's people were told, which means all of it.

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
  Bump from the current highest number (157 as of November 2026 — check the folder).
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
npm run db:sync               # build the schema from the models (see DATABASE_SETUP.md)
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
| Find anything fast (paths, docs, test commands) | **[docs/MAP.md](./MAP.md)** |
| Know why something is built this way | [docs/decisions/](./decisions/README.md) |
| Know what has already broken in production | [docs/incidents/](./incidents/README.md) |
| Understand a specific feature (per role) | [docs/features/](./features/README.md) |
| Understand the data | [docs/DATABASE.md](./DATABASE.md) |
| Add a backend feature | `server/src/routes` → `controllers` → `services` → `models` |
| Add a screen | `client-interface/app/{role}/…` + `lib/services/*-api.ts` |
| Understand intake/registration | `services/applicationService.js`, `cohortIntakeService.js`, `authService.js` |
| Understand tasks/progress | `services/taskService.js`, `submissionService.js` |
| Understand real-time | `server/src/socket/index.js`, `client-interface/components/shared/messages/` |
| Understand cohort-review **live video** (Jitsi) | [docs/COHORT-REVIEW-VIDEO.md](./COHORT-REVIEW-VIDEO.md) — self-hosted Jitsi + attendance/talk-time flows, all files |
| API reference | [server/docs/API_DOCUMENTATION.md](../server/docs/API_DOCUMENTATION.md) |
