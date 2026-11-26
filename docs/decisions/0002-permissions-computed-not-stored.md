# 0002 — Permissions are computed per request, not stored

**Status:** accepted, in production.

## Decision

A user's effective permissions are derived on every request from their role grants,
each bound to a scope (`org` > `program` > `clan` > `self`). Nothing caches a
permission list on the user row, so revoking a grant takes effect on the next request.

## Evidence in this repository

- `server/src/services/authzService.js` — `can()`, `getEffectivePermissions()`,
  `getCapabilities()`, `getAssignments()`, `canAtMinScope()`, `assertProgramInScope()`.
- `SCOPE_RANK = { org: 3, program: 2, clan: 1, self: 0 }` (`authzService.js:38`).
- Role and permission vocabularies: `server/src/config/roles.js`,
  `server/src/config/permissions.js`.
- Custom roles are loaded into a process-local map with an explicit
  `invalidateCustomRoles()` — the only cache, and it is invalidated deliberately.
- Tests: `server/tests/access/` (permission catalogue, program-admin scope,
  mentor enrollment scope, portal narrowing).

## What it buys

- Removing a role is immediate; there is no stale capability list to expire.
- One account can hold several roles at once (lead mentor here, mentee there) without
  the roles bleeding into each other.
- A lead mentor can switch individual permissions off for one co-mentor, because the
  grant is a row, not a baked-in role.

## What it costs

- Permission resolution hits the database on each request that asks for it.
- The logic is concentrated in one ~1000-line service, which is where every
  authorization question has to be answered rather than inline in a route.

## Revisit if

Permission resolution shows up as a measurable share of request time. The fix would be
a short-lived per-request memo, not a stored list.

## Related

[features/authorization-rbac.md](../features/authorization-rbac.md),
[0005](0005-portal-scope-travels-with-the-request.md)
