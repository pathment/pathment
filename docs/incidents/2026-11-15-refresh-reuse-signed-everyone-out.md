# 2026-11-15 — A dropped refresh reply signed people out of every device

**Commit:** `6a0204f6` *fix(auth): stop signing people out of every device on a lost refresh reply*
**Area:** authentication, refresh-token rotation
**Impact:** over 14 days in production, the refresh-token reuse alarm fired for **25
users (80 tokens)**, on almost every day, each time ending every session that person
had. Separately, **22 active users** were cut off at the fixed 30-day mark.

## What happened

Refresh tokens rotate: presenting one mints a successor and spends the old one.
Presenting a spent token is the classic signal of token theft, and the response was to
revoke every session the user had.

The trigger was ordinary. A refresh reply that never reaches the browser — page reload,
tab closed, laptop asleep, network drop — leaves the server rotated and the browser
still holding the spent token. Minutes or hours later the browser presents it, and that
was read as theft.

## Cause

Reuse detection could not tell a lost reply from a stolen token, and the blast radius
was set to "every device" for both. A second, unrelated problem: rotation never extended
a session, so a remembered session died at a fixed 30 days of age regardless of use.

## Fix

Server — `server/src/services/authService.js` (`refreshAccessToken`):

- A spent token whose **successor has never been used** gets that same successor back,
  at any age. Nobody else has used the chain, so nothing was stolen.
- Two tabs racing inside the retry window both get the chain's live end.
- A genuine duplicate (successor already used) revokes **that session's chain only**,
  not every device.
- Remembered sessions slide: 30 days from last use, capped at 90 days from sign-in.
  One-day sessions keep their fixed end. Session facts ride in the token (`ss`, `sl`,
  `n`), sized to stay under the 255-character column.

Client — `client-interface/lib/services/auth-session.ts`:

- Refreshes take a cross-tab **Web Lock**; a tab that waited uses the token another tab
  just obtained instead of spending a stale one.
- A rejected refresh is retried once with the stored token, in case another tab rotated
  it meanwhile, before being treated as a logout.

## Guard

`server/tests/auth/token-security.test.js` — lost reply recovered after 3 hours, tabs
racing, a real duplicate ending only that session while the phone stays signed in,
sliding expiry, the 90-day ceiling, fixed one-day sessions, token length.

## Lesson

Classify failures before acting on them. "Spent token presented" has a common innocent
cause and a rare malicious one; the response has to fit which. And when a guard does
fire, scope the blast radius to the chain that is actually implicated.

## Related

[features/authentication.md](../features/authentication.md), `README.md` §"Auth that
survives bad Wi-Fi"
