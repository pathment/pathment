# Research and investigations

This folder is an **index**, not a second copy. Pathment already carries a good deal of
investigative writing; the point here is that you can find it without grepping, and that
you can tell at a glance whether a document is a measurement, a recommendation or a
status report.

Nothing was duplicated into this folder. Each entry links to the document that already
exists, with its status and date as the document itself states them.

## Measurements — numbers taken against something real

| Document | Question it answers | As of |
| --- | --- | --- |
| [../VIDEO-CAPACITY.md](../VIDEO-CAPACITY.md) | How much concurrent video can the self-hosted Jitsi deployment carry? Worked out from what is deployed and what the workspace actually does. | measured against production, 17 Oct 2026 |

## Security and isolation audits — what is proven, and what is not

| Document | Scope | Standing |
| --- | --- | --- |
| [../TENANT_SOCKET_WORKER_AUDIT.md](../TENANT_SOCKET_WORKER_AUDIT.md) | Tenant isolation across Socket.IO and the background workers. Lists the remaining worker blockers by file, and the prerequisites before non-default workspaces can be served. | socket side fixed and tested; **worker gaps open** |
| [../HANDOFF_SECURITY_AUDIT.md](../HANDOFF_SECURITY_AUDIT.md) | The PKCE session handoff from a legacy workspace origin to the canonical app. Threat model, origin checks, retry semantics. | verified, with the deployment prerequisites listed in the doc |

Read both before changing anything in `server/src/socket/`, `server/src/workers/`, or
the workspace resolution path. They are the most load-bearing documents in the
repository and they are explicit about what has *not* been proven.

## Recommendations — a decision proposed, not yet taken

| Document | Proposes | Status as written |
| --- | --- | --- |
| [../MOBILE-APP-STRATEGY.md](../MOBILE-APP-STRATEGY.md) | React Native via Expo with a development build, and the scope of a first version. | "recommendation, not yet decided", August 2026 |
| [../specs/task-progress-log.md](../specs/task-progress-log.md) | Daily progress logging on a task. | "proposed" |

## Status reports — a snapshot of in-flight work

These go stale by design. Check the code before trusting one.

| Document | About |
| --- | --- |
| [../PROGRAM_COMPLETION_STANDING_CLANS_STATUS.md](../PROGRAM_COMPLETION_STANDING_CLANS_STATUS.md) | What of program completion and standing clans is implemented versus verified. |
| [../WORKSPACE_PATH_ROLLOUT.md](../WORKSPACE_PATH_ROLLOUT.md) | The `/w/<workspace>` URL rollout: existing-data handling, model coverage gaps, release order. |
| [../ADMIN_WORKSPACE_USER_LIFECYCLE.md](../ADMIN_WORKSPACE_USER_LIFECYCLE.md) | How membership status surfaces in the admin directory. |
| [../HEROKU_PRODUCTION_ROLLOUT.md](../HEROKU_PRODUCTION_ROLLOUT.md) | The production tenancy cutover. |

## Deep implementation guides

| Document | About |
| --- | --- |
| [../RAG_README.md](../RAG_README.md) | The retrieval-augmented generation subsystem, file by file: hybrid retrieval, the mentor style-learning feedback loop, both workers. |
| [../COHORT-REVIEW-VIDEO.md](../COHORT-REVIEW-VIDEO.md) | Live clan review on self-hosted Jitsi: attendance, talk time, every file involved. |
| [../TANSTACK-QUERY.md](../TANSTACK-QUERY.md) | How the client uses TanStack Query, and where it deliberately does not. |

## Not in this repository

`articles/` holds 27 engineering write-ups on specific problems in this codebase
(scope-aware authorization, the database as a queue, fairness analytics, and so on).
It is **deliberately untracked** — it exists only in a local working copy. The
architecture docs cite it by number (for example "article 18"). Do not copy its
contents into tracked files.

Operational runbooks live in the private `pathment-infra` repository and in
`OPS-RUNBOOK.local.md`, which is untracked for the same reason: both carry hostnames
and infrastructure detail that must not be committed here.

## Adding to this folder

Write a new file here only for an investigation that does not belong anywhere else —
a question you answered with evidence that has not yet become a decision. If it
concluded in a choice, write a [decision record](../decisions/) instead. If it was a
production failure, write an [incident record](../incidents/).
