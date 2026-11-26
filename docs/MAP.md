# Project map

The navigation index. Find your area, read the linked doc, then open only the listed
source files. Everything here was checked against the tree; `(unverified)` and
`(assumption)` mark anything that was not.

## How to use this map

1. Find the area your task touches in **Feature areas** below.
2. Read its feature doc (one file, ~40 lines) — not `ARCHITECTURE.md` in full.
3. Open the listed entry points. Search within them rather than across the repo.
4. Check **Decisions** and **Incidents** before changing a flow that has one.

## Repository shape

```
server/             Express API, Sequelize models, workers, socket, public API v1
  src/routes/       URL + middleware (authenticate, authorize, validate)
  src/controllers/  thin HTTP shaping
  src/services/     all business logic and transactions  (122 files)
  src/models/       Sequelize models, grouped by domain  (144 files)
  src/middlewares/  auth, authz, organizationContext, portalScope, auditTrail, errorHandler
  src/workers/      email, certificates, sync, webhooks, course sync, retention, discussions
  src/features/rag/ retrieval-augmented generation subsystem (own models + workers)
  src/publicApi/    external API v1 (API-key auth, own error envelope)
  src/integrations/ API keys, pull connectors, field mapping, sync
  src/webhooks/     outgoing signed webhooks
  scripts/migrations/  numbered, idempotent schema migrations (highest: 157)
  tests/            Jest, 172 test files
client-interface/   Next.js App Router
  app/              routes, role-first: (auth) (public) admin mentor mentee platform …
  components/       admin mentor mentee platform shared ui …
  lib/services/     one *-api.ts per domain over a shared Axios client (66 files)
  lib/query/        TanStack Query client, keys, useApiQuery
  lib/context/      Auth, Organization, Clan, AdminScope, Call, Theme, Confirm
  proxy.ts          /w/<workspace>/… URL rewriting + legacy host handling
  tests/            node:test, *.test.cjs (23 files)
docs/               this documentation
```

Not in this repository: the marketing site (`pathment/pathment-marketing`) and the
mobile app (private). Several older docs still describe `marketing-site/` as a folder
here — see **Known documentation drift**.

## Feature areas

| Area | Source | Doc |
| --- | --- | --- |
| Authentication, JWT + refresh rotation, 2FA | `server/src/services/authService.js`, `server/src/middlewares/auth.js`, `client-interface/lib/services/auth-session.ts` | [features/authentication.md](features/authentication.md) |
| Authorization (scoped RBAC) | `server/src/services/authzService.js`, `server/src/config/{roles,permissions}.js`, `server/src/middlewares/authz.js` | [features/authorization-rbac.md](features/authorization-rbac.md), [decisions/0002](decisions/0002-permissions-computed-not-stored.md) |
| Workspaces / multi-tenancy | `server/src/middlewares/organizationContext.js`, `server/src/db/organizationScope.js`, `server/src/services/organizationService.js`, `client-interface/proxy.ts` | [features/multi-tenancy-workspaces.md](features/multi-tenancy-workspaces.md), [decisions/0003](decisions/0003-workspace-scoping-in-the-orm.md) |
| Portal scope (one account, many hats) | `server/src/middlewares/portalScope.js`, `server/src/services/authzService.js` (`programScopeFor`) | [ARCHITECTURE.md §3](ARCHITECTURE.md#portal-scope-which-hat-is-the-caller-wearing), [decisions/0005](decisions/0005-portal-scope-travels-with-the-request.md) |
| Intake, applications, assessments | `server/src/services/{applicationService,publicIntakeService,assessmentService}.js`, `server/src/routes/{intake,assessments,public}.js` | [features/intake-and-assessments.md](features/intake-and-assessments.md) |
| System pool (pre-clan selection) | `server/src/models/pools/`, `server/src/routes/pools.js` | [features/system-pool.md](features/system-pool.md) |
| Programs, cohorts, clans | `server/src/services/clanService.js`, `server/src/routes/{programs,clans,clanRequests}.js` | [features/programs-cohorts-clans.md](features/programs-cohorts-clans.md), [features/clan-public-join.md](features/clan-public-join.md) |
| Roadmaps, tasks, submissions, review | `server/src/services/{taskService,submissionService,standingWorkMirror}.js`, `server/src/routes/{tasks,submissions,linearRoadmaps}.js` | [features/roadmaps-and-tasks.md](features/roadmaps-and-tasks.md) |
| Enrollment & progress (single source of truth) | `server/src/services/taskService.js` → `updateEnrollmentTaskStats` | [features/enrollment-and-progress.md](features/enrollment-and-progress.md) |
| Blockers & delays | `server/src/routes/friction.js` | [features/blockers-and-delays.md](features/blockers-and-delays.md) |
| Live clan review (Jitsi) | `server/src/services/reviewMeetingService.js`, `client-interface/lib/context/CallContext.tsx` | [COHORT-REVIEW-VIDEO.md](COHORT-REVIEW-VIDEO.md), [VIDEO-CAPACITY.md](VIDEO-CAPACITY.md) |
| Messaging & group chat | `server/src/services/messagingService.js`, `server/src/socket/index.js` | [features/messaging.md](features/messaging.md) |
| Notifications & email queue | `server/src/services/{emailService,notificationOrchestrator,notificationScheduler}.js`, `server/src/workers/emailWorker.js` | [features/notifications-and-email.md](features/notifications-and-email.md), [decisions/0001](decisions/0001-postgres-is-the-job-queue.md) |
| Community feed | `server/src/routes/community.js` | [features/community.md](features/community.md) |
| Gamification | `server/src/routes/gamification.js`, `server/src/config/points.js` | [features/gamification.md](features/gamification.md) |
| Certificates | `server/src/routes/certificates.js`, `server/src/workers/certificateWorker.js` | [features/certificates.md](features/certificates.md) |
| Scheduling & 1:1s | `server/src/services/schedulingService.js` | [features/scheduling.md](features/scheduling.md) |
| Analytics & insights | `server/src/routes/{activity,performance}.js` | [features/analytics-and-insights.md](features/analytics-and-insights.md) |
| AI integration (BYO keys) | `server/src/routes/aiConnections.js`, `server/src/services/` AI layer | [features/ai-integration.md](features/ai-integration.md), [decisions/0006](decisions/0006-bring-your-own-ai-key.md) |
| RAG subsystem | `server/src/features/rag/` (own models, services, 2 workers) | [RAG_README.md](RAG_README.md) |
| Public API v1 + sync + webhooks | `server/src/publicApi/v1.js`, `server/src/integrations/`, `server/src/webhooks/` | *(no feature doc yet — read the source headers)* |
| Platform console (operator) | `server/src/routes/platform.js`, `server/src/middlewares/platformAdmin.js`, `client-interface/app/platform/` | [features/platform-console.md](features/platform-console.md) |
| Proctoring (quizzes, interviews) | `server/src/proctoring/` | `server/src/proctoring/README.md` |
| Profile, skills, settings | `server/src/routes/{profile,skills}.js` | [features/profile-skills-settings.md](features/profile-skills-settings.md) |
| Data model (all domains) | `server/src/models/` | [DATABASE.md](DATABASE.md) |

## Entry points

| What | Where |
| --- | --- |
| API process | `server/src/index.js` — middleware chain, route mounting, worker startup |
| Route table | `server/src/routes/index.js` |
| Model loader | `server/src/db/index.js` — walks `src/models/**`, runs `associate()` |
| Tenant scoping hooks | `server/src/db/organizationScope.js` |
| Socket.IO | `server/src/socket/index.js` |
| Public API v1 | `server/src/publicApi/v1.js` (mounted before the `/api` rate limiter) |
| Provider webhooks (Resend) | `server/src/routes/webhooks.js` → `POST /webhooks/resend` |
| Web app shell | `client-interface/app/layout.tsx`, `client-interface/proxy.ts` |
| Axios client | `client-interface/lib/services/api-client.ts`, `axios-instance.ts` |

### Background workers (started in `server/src/index.js`, each with a disable flag)

| Worker | File | Disable flag |
| --- | --- | --- |
| Email queue | `src/workers/emailWorker.js` | `EMAIL_WORKER_DISABLED` |
| Certificates (PDF + AI) | `src/workers/certificateWorker.js` | `CERTIFICATE_WORKER_DISABLED` |
| Notification scheduler | `src/services/notificationScheduler.js` | `NOTIFICATION_SCHEDULER_DISABLED` |
| Group-discussion reminders | `src/workers/discussionMeetingWorker.js` | `NOTIFICATION_SCHEDULER_DISABLED` |
| Course sync (15 min) | `src/workers/courseSyncWorker.js` | `COURSE_SYNC_DISABLED` |
| People sync (`sync_runs`) | `src/workers/syncWorker.js` | `SYNC_WORKER_DISABLED` |
| Outgoing webhooks | `src/workers/webhookWorker.js` | `WEBHOOK_WORKER_DISABLED` |
| RAG ingestion + learning | `src/features/rag/workers/` | `RAG_WORKERS_DISABLED` |
| Data retention | `src/workers/dataRetentionWorker.js` | opt-in: `DATA_RETENTION_ENABLED=true` |

## Test and validation commands

| Check | Command | In CI? |
| --- | --- | --- |
| Server syntax | `cd server && npm run lint` | yes (blocking) |
| Server tests (Jest, 172 files) | `cd server && npm test` | **no** |
| One server test | `cd server && npx jest tests/auth/login.test.js --runInBand` | no |
| DB-free socket tenant tests | see [TENANT_SOCKET_WORKER_AUDIT.md](TENANT_SOCKET_WORKER_AUDIT.md) | no |
| Handoff unit tests | `cd server && npx jest --config jest.handoff-unit.config.js --runInBand` | no |
| Client types | `cd client-interface && npx tsc --noEmit` | via build |
| Client build | `cd client-interface && npm run build` | yes (blocking) |
| Client lint | `cd client-interface && npm run lint` | yes (advisory — ~400 known errors) |
| Client tests | `cd client-interface && node --test tests/<name>.test.cjs` | no |
| Secrets | gitleaks + tracked `.env`/key check | yes (blocking) |
| Workflow lint, dependency review | actionlint, `dependency-review-action` | yes |

Server tests require `server/.env.test` with a `DATABASE_URL` whose name contains
`test`; `tests/env.js` refuses to run otherwise. `tests/setup.js` mocks the email and
notification layers, so a passing test does not prove mail was sent.

Migrations: `npm run db:migrate -- --status` to inspect, `npm run db:migrate` to apply
locally. Never against staging or production from here — see `server/RELEASE.md`.

## Infrastructure and external dependencies

| Thing | Where | Notes |
| --- | --- | --- |
| API | Heroku container apps, built from the **repo-root `Dockerfile`** via `heroku.yml` | Inside a dyno the cwd is `/app`, so it is `node scripts/…`, not `server/scripts/…` |
| Web app | Vercel | Workspace URLs are `/w/<workspace>/…`; legacy tenant hosts still resolve during the session-handoff window |
| Database | PostgreSQL 16 (managed) | Also carries the job queues and vector storage |
| Email | Resend, behind the Postgres `email_queue` | Bounce/complaint webhook at `POST /webhooks/resend` feeds `suppressed_emails` |
| Files | Cloudinary | `server/src/config/cloudinary.js` |
| Video | Self-hosted Jitsi | Media never transits the API; runbook is in the private infra repo |
| LLMs | OpenAI / Gemini / Groq / OpenRouter / Anthropic | Bring-your-own key per workspace, routed per feature |
| CI | `.github/workflows/ci.yml` | Lint, build, secrets. **No deploy workflow** — deploys are manual |

Deployment and release procedure: `server/RELEASE.md` (staging → main promote),
[HEROKU_PRODUCTION_ROLLOUT.md](HEROKU_PRODUCTION_ROLLOUT.md) (the tenancy cutover).
`server/DEPLOY.md` and `server/SECURITY.md` describe a self-hosted Docker + Caddy
deployment on a Linux box, which is a different target from the Heroku path above —
check which one you mean before following either.

## Decisions, incidents, research

- [decisions/](decisions/) — why the system is shaped the way it is.
- [incidents/](incidents/) — production failures, their cause and the guard added.
- [research/](research/) — audits and investigations that have not become decisions.

## Known documentation drift

Recorded, not fixed, so nobody trusts a stale line:

| Where | Says | Actually |
| --- | --- | --- |
| `CONTRIBUTING.md` §3, `docs/SETUP.md` | `marketing-site/` is a folder in this repo | It is a separate repository (`pathment/pathment-marketing`) |
| `docs/SETUP.md` | describes the pre-Heroku local/VPS setup in places | `server/RELEASE.md` is authoritative for deploys |
| `.github/ISSUE_TEMPLATE/*.md` | offer `marketing-site` as an app area | that app is not in this repo |

Four stale lines in `docs/ARCHITECTURE.md` were corrected while this map was written
(`marketing-site/` in the tree, "Bull + Redis" in the stack table, "highest migration
042", and `npm run db:create`).

Check this table before trusting an older doc. When you fix one of these, delete its row.
