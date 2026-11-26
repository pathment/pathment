# Pathment — instructions for Claude Code

Pathment is an operating system for mentor-led training programs: apply → assess →
place into a clan → work a roadmap → get reviewed → graduate. Live in production.

**Start every task at [`docs/MAP.md`](docs/MAP.md).** It maps each feature area to its
source paths, docs, entry points and test commands. Read the one feature doc the task
touches, then the source. Do not scan the tree.

## The two apps in this repository

| Path | What it is | Dev port |
| --- | --- | --- |
| `server/` | Node 20 + Express 4 + Sequelize 6 + PostgreSQL + Socket.IO. All business logic. | 5000 |
| `client-interface/` | Next.js 16 App Router + React 19 + TypeScript + Tailwind v4. | 3000 |

The marketing site and the mobile app are **separate repositories**, not folders here.

## Non-negotiable rules

1. **Layering (server):** `routes/` → `controllers/` → `services/` → `models/`.
   Controllers stay thin. All logic, transactions and socket/queue emissions live in
   services. Only models touch the database.
2. **Every model change needs a migration.** Numbered, idempotent, `--rollback`-capable,
   in `server/scripts/migrations/`. Never edit a shipped migration. See
   [`docs/decisions/0004-hand-run-idempotent-migrations.md`](docs/decisions/0004-hand-run-idempotent-migrations.md).
3. **Workspace (tenant) scoping is a security boundary.** Rows with `organizationId` are
   scoped automatically by the ORM hook; **raw SQL is not**. Read
   [`docs/features/multi-tenancy-workspaces.md`](docs/features/multi-tenancy-workspaces.md)
   before touching queries, workers or sockets.
4. **Errors are typed and carry a stable `code`.** Clients branch on `code`, never on the
   message. Use `catchAsync` + `successResponse`.
5. **Colour:** `brand-*` tokens only on the client. Never hardcode `indigo-*`.
6. **Never commit secrets.** `.env*` files are blocked by CI (gitleaks + a tracked-file
   check). `OPS-RUNBOOK.local.md`, `articles/` and `infrastructure/` are deliberately
   untracked — do not copy their contents into tracked files.

## Verifying a change

```bash
cd server && npm run lint              # syntax check (what CI runs)
cd server && npm test                  # Jest; needs DATABASE_URL containing "test" in .env.test
cd client-interface && npx tsc --noEmit && npm run build
cd client-interface && node --test tests/<name>.test.cjs
```

**CI does not run the server test suite** — run it yourself before saying a change works.

## Out of bounds unless asked explicitly

Deploying, pushing to a Heroku remote, running migrations against staging or production,
and touching `heroku.yml` / `Dockerfile`. Release procedure lives in `server/RELEASE.md`.
