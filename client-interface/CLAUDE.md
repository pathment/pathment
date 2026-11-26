# client-interface/ — frontend rules

Next.js 16 App Router · React 19 · TypeScript · Tailwind v4 · TanStack Query.
Start at [`../docs/MAP.md`](../docs/MAP.md).

## Structure

Role first, feature second: `app/(auth)/`, `app/admin/`, `app/mentor/`, `app/mentee/`,
`app/platform/`. Shared code in `components/` and `lib/`.

## Data access

- One `lib/services/<domain>-api.ts` per domain, over the shared Axios client
  (`lib/services/api-client.ts`). **Components never call Axios directly.**
- Server state goes through TanStack Query. Keys live in `lib/query/keys.ts` — add to
  that file, do not inline a key. Conventions and the deliberate exceptions:
  [`../docs/TANSTACK-QUERY.md`](../docs/TANSTACK-QUERY.md).
- Types in `lib/types/`.

## Errors

Read the envelope, not the message: `extractApiErrorMessage`, `getErrorCode`,
`getRequestId`, `getRateLimit` from `lib/utils/api-error.ts`. Branch on `code`.
Let a thrown component hit the nearest `error.tsx` rather than white-screening.

## Colour and theming

`styles/globals.css` `@theme inline` is authoritative. Use `brand-*` tokens for every
accent. **Never hardcode `indigo-*`.** Dark mode works through the `--color-slate-*`
overrides under `.dark`; do not special-case it per component.

## Workspace URLs

Public URLs are `/w/<workspace>/…`; `proxy.ts` rewrites them onto the route tree. Do not
add a path that bypasses it, and remember the exemptions it already encodes: `/_next/`,
files in `/public`, `/api`, `/_link/`, `/.well-known/`.

## Auth sessions

`lib/services/auth-session.ts` handles refresh with a cross-tab Web Lock and a single
retry. Do not add a second refresh path or treat one rejected refresh as a logout —
that regression signed people out of every device once:
[`../docs/incidents/2026-11-15-refresh-reuse-signed-everyone-out.md`](../docs/incidents/2026-11-15-refresh-reuse-signed-everyone-out.md).

## Verifying

```bash
npx tsc --noEmit
npm run build                        # blocking in CI
node --test tests/<name>.test.cjs    # node:test, transpiles the source under test
```

`npm run lint` is advisory in CI — the tree has a known ESLint debt of roughly 400
errors. Do not add to it; do not "fix" the whole baseline in an unrelated change.
