# Decision records

Why the system is shaped the way it is. One file per decision, numbered, with the
evidence that supports it. A decision record is written from what is already in the
code, the commit history or an existing document — never from guesswork.

| # | Decision | Status |
| --- | --- | --- |
| [0001](0001-postgres-is-the-job-queue.md) | PostgreSQL is the job queue; no Redis, no Bull | Accepted, in production |
| [0002](0002-permissions-computed-not-stored.md) | Permissions are computed per request, not stored | Accepted, in production |
| [0003](0003-workspace-scoping-in-the-orm.md) | Tenant scoping lives in the ORM layer, behind a rollout gate | Accepted, rollout gated |
| [0004](0004-hand-run-idempotent-migrations.md) | Numbered idempotent migrations, run by hand | Accepted, in production |
| [0005](0005-portal-scope-travels-with-the-request.md) | The active portal travels with the request | Accepted, in production |
| [0006](0006-bring-your-own-ai-key.md) | Bring-your-own AI key, routed per feature | Accepted, in production |

Adding one: copy the shape of an existing file. State the decision, the evidence in
this repository, what it buys, what it costs, and what would make you revisit it.
