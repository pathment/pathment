# 0005 — The active portal travels with the request

**Status:** accepted, in production.

## Decision

Two headers state which hat the caller is currently wearing:

| Header | Values |
| --- | --- |
| `X-Portal-Role` | `mentee` \| `mentor` \| `admin` |
| `X-Active-Clan` | a clan uuid, or `all` |

The middleware that reads them **only parses**. `req.portal` is a stated preference,
never a grant: it can narrow what a user is shown and can never widen it.

## Evidence in this repository

- `server/src/middlewares/portalScope.js` — the file header states the problem and the
  guarantee: *"This middleware only PARSES (no DB, no I/O) … It can only ever NARROW
  what a user sees … a portal the user does not actually hold resolves to nothing
  rather than to more."*
- Consumers: `authzService.programScopeFor(user, portalRole)`, `getCapabilities`.
- Tests: `server/tests/access/portal-scope.test.js`,
  `portal-narrows-admin.test.js`, `admin-portal-clan-leak.test.js`.
- Narrative: [../ARCHITECTURE.md §3 "Portal scope"](../ARCHITECTURE.md).

## Why it was needed

Authorization answers *may I*. It does not answer *which of my roles is this question
about*. Without the second answer, every "my stuff" endpoint returned the **union** of
every hat: a mentor's own Roadblocks page listed their mentees' roadblocks, and their
mentee inbox listed the threads they hold as a mentor.

## What it costs

- A client that forgets the header gets the old union behaviour for routes that read
  `req.portal` — the failure is a wrong-looking list, not an error.
- Every endpoint that answers "my X" has to decide whether it is portal-aware.

## Rule for new endpoints

If an endpoint answers *"my …"* for a user who could hold more than one role, read
`req.portal` and narrow. Never use it to grant.

## Related

[0002](0002-permissions-computed-not-stored.md),
[features/authorization-rbac.md](../features/authorization-rbac.md)
