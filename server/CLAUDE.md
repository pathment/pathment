# server/ — backend rules

Node 20 · Express 4 · Sequelize 6 · PostgreSQL · Socket.IO. Start at
[`../docs/MAP.md`](../docs/MAP.md); architecture is in [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).

## Layering

`routes/` → `controllers/` → `services/` → `models/` → PostgreSQL.

- Controllers are thin: wrap in `catchAsync`, call one service, return
  `successResponse(...)`. No business logic, no transactions, no model queries.
- Services own logic, transactions, cross-model writes, socket emissions and job
  enqueues. Most are singletons (`module.exports = new XService()`).
- Models are auto-loaded by `src/db/index.js`, which walks `src/models/**` and runs each
  `associate()`. Drop the file in the right domain folder; never wire one manually.
- Validate shape with Joi in `src/validations/` via `validateBody/Params/Query`.

## Errors

Throw a typed error from `src/utils/errors/` (`NotFoundError`, `ValidationError`,
`ConflictError`, `ForbiddenError`, …). Each carries a **stable `code`** that clients
branch on. `middlewares/errorHandler.js` turns it into the one envelope
(`message` + `code` + `errors[]` + `requestId`). Never return a bare string, and never
let an internal message reach a production response.

## Tenancy — read before writing a query

Rows with `organizationId` are scoped automatically by `src/db/organizationScope.js`.

- **Raw SQL is not scoped.** Any `sequelize.query` must carry its own tenant predicate.
- Background workers run outside a request and so have **no ambient context**. Resolve
  and enter the owning workspace deliberately; do not rely on a default.
- `skipOrganizationScope: true` is the escape hatch. Using it needs a comment saying why.
- Full picture: [`../docs/features/multi-tenancy-workspaces.md`](../docs/features/multi-tenancy-workspaces.md).

## Authorization

Ask `authzService`, never re-derive. `can()`, `getEffectivePermissions()`,
`canAtMinScope()`, `assertProgramInScope()`, `canViewMentee()`, `canActOnTask()`.
Scopes rank `org > program > clan > self`.

If an endpoint answers *"my …"* for someone who might hold several roles, read
`req.portal` and **narrow**. It is a stated preference and grants nothing.

## Schema changes

Every model change needs a migration in `scripts/migrations/`: numbered from the current
highest, idempotent, with a working `--rollback`. Data repairs back up to a table first.
Never edit a shipped migration. Rules: [`../docs/decisions/0004-hand-run-idempotent-migrations.md`](../docs/decisions/0004-hand-run-idempotent-migrations.md).

Do not run migrations against staging or production. That is `server/RELEASE.md`, done
by a person.

## Queues and side effects

Queues are Postgres tables claimed with `FOR UPDATE SKIP LOCKED`. Enqueue inside the same
transaction as the write that causes the job.

**Order matters:** advance the state that records a send *before* sending, not after. A
failed write then costs one missing email instead of an hourly repeat — see
[`../docs/incidents/2026-11-19-reengagement-reminder-sent-every-hour.md`](../docs/incidents/2026-11-19-reengagement-reminder-sent-every-hour.md).

Mail goes through `emailService.enqueue`. Never call Resend directly.

## Verifying

```bash
npm run lint                                   # syntax check — what CI runs
npm test                                       # Jest; needs DATABASE_URL containing "test"
npx jest tests/<area>/<file>.test.js --runInBand
```

`tests/setup.js` mocks the email and notification layers, so a green test does not prove
mail was sent. CI does **not** run this suite — run it yourself.
