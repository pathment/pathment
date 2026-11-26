# Incidents

Production failures that are worth remembering: what broke, why, what guards it now.
Each record names the commit it was reconstructed from, so you can read the real diff.

Only write a record for something that actually happened and left evidence — a commit,
a repair migration, a test. Never write one from memory or inference.

| Date | What broke | Area |
| --- | --- | --- |
| 2026-11-19 | A win-back reminder was re-sent every hour, ~25 emails a day per paused mentee | [queue / tenancy](2026-11-19-reengagement-reminder-sent-every-hour.md) |
| 2026-11-15 | Creating a workspace also made you an admin of the default workspace | [tenancy / security](2026-11-15-signup-leaked-default-workspace-admin.md) |
| 2026-11-15 | A dropped refresh reply signed people out of every device | [auth](2026-11-15-refresh-reuse-signed-everyone-out.md) |
| 2026-11-12 | Mentees saw the same task twice in a standing clan | [tasks](2026-11-12-duplicate-mirrored-tasks.md) |

## Reading these

The pattern worth noticing across all four: **a guard fired on a symptom that also has
an innocent cause.** Reuse detection treated a lost network reply as theft. A hook that
joins a user to "the request's workspace" treated "no workspace" as the default one.
Dedupe on the direct source row treated a chain as a pair. When you add a guard, ask
what an ordinary, blameless user looks like to it.
