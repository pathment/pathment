# Cohort‑Review Live Video (Jitsi) — Full Reference

**Audience:** any engineer or AI agent picking this up cold.
**Scope:** the live‑video feature inside a mentor's cohort review — how it works end to
end, every file involved, the data model, the flows, the self‑hosted Jitsi server, config
flags, deploy, and the known limitations / design decisions.

Sections **§1–§11** cover the base live‑review call. Sections **§12–§14** cover the
enhancements built on top of it:
- **§12 Recurring review scheduling** — mentors set a weekly/biweekly review; occurrences
  auto‑materialise, the room self‑opens, and everyone gets timezone‑correct invites + reminders.
- **§13 Admin review records** — read‑only org reporting over review sessions (clan‑ / mentor‑wise).
- **§14 Admin‑hosted live meetings** — org broadcasts with audience control (mentors / clan / both),
  reusing the same Jitsi room UI plus a live "Join" banner for every role.

Server credentials, IPs and SSH keys are **not** here — they live in the gitignored
`OPS-RUNBOOK.local.md`. This doc is safe to commit.

---

## 1. TL;DR / What it is

During a cohort review, a mentor can run a **live video call** with their clan's mentees,
embedded directly in Pathment (no external links). While live it can:

- show mentees a real‑time **"Join review"** banner,
- optionally **auto‑mark attendance** (who joined = present),
- estimate each mentee's **speaking time** and pre‑select speakers for a **contribution point**,
- end the call and **score** contributions.

The video itself runs on a **self‑hosted Jitsi** at `meet.pathment.me` (one server, shared
by staging and prod). Pathment only stores **metadata** (attendance, seconds, points) — **no
audio/video is ever recorded or stored** (Jibri is not installed).

The whole feature is behind a **feature flag** so it can ship dormant.

---

## 2. Architecture

```
Mentee browser ─┐                         ┌─ Mentor browser
   (ReviewJoinBar)                         (ReviewMeetingPanel)
        │  embeds <JitsiRoom>  ────────────────►  embeds <JitsiRoom>
        │        │                                       │
        │        └──────── WebRTC media ─────────────────┘
        │                  via meet.pathment.me (Jitsi SFU)
        │                                                 │
        └────► Pathment API (Express) ◄───────────────────┘
                   │  attendance / talk-time / contribution (metadata only)
                   ▼
             Postgres  +  Socket.IO (real-time "review:started")
```

Two independent systems:

- **A. The Jitsi server** (`meet.pathment.me`) — carries the actual audio/video. Pathment
  embeds it via Jitsi's iframe (`external_api.js`). See §7.
- **B. The Pathment app** — owns the *review* domain: sessions, attendance, talk‑time,
  contribution scoring, the join banner, the feature flag. See §3–§6.

They are linked by exactly one thing: the **room name** (a per‑session slug) and the
**domain** (`JITSI_DOMAIN`). Pathment tells each browser "join room X on domain Y"; the
browsers connect to Jitsi directly. Pathment is never in the media path.

Deploy targets:
- **Frontend** (`client-interface/`, Next.js) → **Vercel** (`staging.pathment.me`, prod `devweekends.pathment.me`).
- **Backend** (`server/`, Express) → **DO container** (staging) / **Heroku** (prod).
- **Jitsi** → **one** Oracle Cloud VM, serves both environments.

---

## 3. Feature flags & config

Server config module: **`server/src/config/reviewMeeting.js`** (all env‑overridable).

| Key | Env var | Default | Meaning |
|---|---|---|---|
| `enabled` | `REVIEW_MEETING_ENABLED` | `false` | Master switch. OFF ⇒ feature dormant everywhere. |
| `comingSoon` | `REVIEW_MEETING_COMING_SOON` | `false` | When disabled, show a "Coming soon" teaser instead of nothing. |
| `provider` | `REVIEW_MEETING_PROVIDER` | `jitsi` | Provider label. |
| `jitsiDomain` | `JITSI_DOMAIN` | `meet.jit.si` | Which Jitsi host to embed. **Set to `meet.pathment.me`.** |
| `contributionThresholdSeconds` | `REVIEW_CONTRIBUTION_SECONDS` | `20` | Talk seconds that pre‑checks a mentee for the point. |
| `contributionPoints` | `REVIEW_CONTRIBUTION_POINTS` | `1` | Points awarded for contributing. |

**Environment matrix (intended):**

| Env | `ENABLED` | `COMING_SOON` | `JITSI_DOMAIN` | Result |
|---|---|---|---|---|
| Production | `false` | `true` | `meet.pathment.me` | "Coming soon" teaser (feature dark) |
| Staging | `true` | — | `meet.pathment.me` | Fully live |
| Local | unset | unset | — | Hidden |

To go live in prod: set `REVIEW_MEETING_ENABLED=true` (and drop `COMING_SOON`).

---

## 4. Data model

Two tables (models under `server/src/models/scheduling/`). A **session** = one review event
(one date, one clan). A **meeting** = a live call within a session (can be started/ended/
restarted; each restart is a fresh call).

**`cohort_review_sessions`** (added by migration `083`):
| Column | Purpose |
|---|---|
| `meeting_provider` | e.g. `jitsi` |
| `meeting_room` | non‑guessable room slug `pathment-review-<sid8>-<hex>` (generated once, reused) |
| `meeting_url` | full join URL (convenience; clients actually use domain+room) |
| `external_meeting_url` | optional fallback link (Meet/Zoom) |
| `meeting_started_at` | **re‑stamped on every start/resume** — a live call is "now" |
| `meeting_ended_at` | set on end; `NULL` while live |
| `attendance_tracking` (migration `084`) | BOOL, default **false**. ON ⇒ joining marks present |

**`cohort_review_entries`** (per session×mentee; meeting columns added by `083`):
| Column | Purpose |
|---|---|
| `attendance` | `present` / `absent` / `excused` / `NULL` |
| `auto_present` | true = set by the system (join), false = mentor set it manually |
| `joined_at` | first join of the current call (reset on restart) |
| `left_at`, `seconds_present` | presence duration |
| `talk_seconds` | estimated dominant‑speaker time (see §6.4). Monotonic (server keeps the max). |
| `contribution_points` | points awarded this session (audit + idempotency) |

Migrations: **`083_review_meeting.js`** (all meeting columns), **`084_review_attendance_tracking.js`**
(the toggle column). Both additive/idempotent. **Must be run on prod** (Heroku doesn't auto‑migrate).

---

## 5. API surface

Mentor routes — `server/src/routes/mentor.js`, controller `reviewMeetingController.js`,
service `reviewMeetingService.js`:

| Method + path | Handler | Does |
|---|---|---|
| `GET /mentor/review/meeting-config` | `config` | `{enabled, comingSoon}` — **session‑independent**, so the panel can decide before any session exists |
| `POST /mentor/review/sessions/:id/meeting/start` | `start` | open/resume the room (see §6.1) |
| `POST /mentor/review/sessions/:id/meeting/end` | `end` | set `meeting_ended_at` |
| `GET /mentor/review/sessions/:id/meeting` | `hostView` | embed config + roster + `attendanceTracking` (or `{enabled:false, comingSoon}`) |
| `PUT /mentor/review/sessions/:id/meeting/attendance-tracking` | `setAttendanceTracking` | toggle; ON retroactively marks joined mentees present |
| `PUT /mentor/review/sessions/:id/meeting/present/:menteeId` | (cohortReview `setEntry`) | mentor manual present/absent |
| `POST /mentor/review/sessions/:id/meeting/talk-time` | `recordTalk` | mentor‑observed talk seconds (monotonic max) |
| `GET /mentor/review/sessions/:id/meeting/contribution` | `proposeContribution` | scoring list (speakers pre‑checked) |
| `POST /mentor/review/sessions/:id/meeting/contribution` | `finalizeContribution` | award points via gamification (idempotent) |

Mentee routes — `server/src/routes/mentee.js`:

| Method + path | Handler | Does |
|---|---|---|
| `GET /mentee/review/active` | `active` → `activeForMentee` | the live review in the mentee's clan, or `null` |
| `POST /mentee/review/:id/join` | `join` → `selfPresent` | self‑report presence; body `{talkSeconds}` heartbeats own talk time |
| `POST /mentee/review/:id/leave` | `leave` → `selfLeave` | stamp leave + presence seconds |

Real‑time: `server/src/socket/index.js` exposes `emitToUser`; `startMeeting` calls
`_notifyMenteesStarted` → emits **`review:started`** to each clan mentee's `user:<id>` room.

---

## 6. The flows (step by step)

### 6.1 Mentor starts a meeting
1. Panel `ReviewMeetingPanel` calls `mentorApi.startReviewMeeting(id)` (creating today's
   session first via `ensureSession` if it's still a draft).
2. `reviewMeetingService.startMeeting`:
   - if this is a **restart** (a meeting was started before) → **wipe per‑call attendance**
     (clear `joined_at/left_at/seconds_present/talk_seconds` and any *auto* `present`; keep
     manual marks) so a new call doesn't inherit the last one;
   - generate `meeting_room` once (reused after);
   - **always re‑stamp `meeting_started_at = now`**, clear `meeting_ended_at`;
   - `_notifyMenteesStarted` → socket `review:started` to the clan's mentees.
3. Panel embeds `<JitsiRoom domain=… room=… />` and goes live.

### 6.2 Mentee sees the banner & joins
1. `ReviewJoinBar` (mounted in `app/mentee/layout.tsx`, so on every mentee page) polls
   `menteeApi.getActiveReview()` every 12s **and** listens for the `review:started` socket
   event → instant banner.
2. `activeForMentee` returns the live session **only if**: mentee is an active member of the
   session's clan, `meeting_started_at` is within the last **3h** (staleness guard — stops a
   never‑ended call showing forever), and `meeting_ended_at IS NULL`.
3. Mentee clicks Join → `<JitsiRoom>` opens in a modal → on `videoConferenceJoined` fires
   `onJoined` → `joinReview(sessionId)` → `selfPresent`.

### 6.3 Attendance
- **Toggle** "Track attendance" (mentor panel, default **OFF**) → `setAttendanceTracking`.
  OFF = general call, no attendance. ON = joining marks present.
- **On join** (`selfPresent`): if `attendanceTracking` and not `excused`, set `present` +
  `auto_present` (overrides a prior `absent` — joining is proof). Always set `joined_at`.
- **Heartbeat**: while in the call the mentee re‑reports every 15s (`ReviewJoinBar`), so the
  server always knows who's currently in the room — even someone who stayed connected across
  a mentor restart (whose Jitsi client never re‑fires "joined").
- **Toggle turned ON mid‑call**: `setAttendanceTracking(true)` retroactively marks present
  everyone with a `joined_at` (respecting `excused`).
- Mentor can always click a name to override.

### 6.4 Talk time & contribution
- **Signal:** Jitsi only exposes `dominantSpeakerChanged` (who is *the* dominant speaker).
  There is **no per‑second voice‑activity** in the iframe API.
- **Two trackers, server keeps the max (monotonic):**
  - *Mentee self‑report* (robust): `JitsiRoom.onSelfDominantChange(isMe)` — the mentee's own
    client knows when it is the dominant speaker; `ReviewJoinBar` accumulates and sends
    `talkSeconds` on the heartbeat/leave. No name matching.
  - *Mentor tracking* (fallback): `ReviewMeetingPanel` maps `dominantSpeakerChanged` → roster
    by display name (`onDominant`/`flushTalk` → `recordReviewTalkTime`).
- **Span cap:** a "dominant" speaker stays dominant through **silence** until someone else
  talks. To stop trailing silence inflating the number, **each continuous span is capped at
  `SPEAK_SPAN_CAP = 15s`** on both trackers.
- **Contribution:** `proposeContribution` returns the roster; anyone with `talk_seconds ≥
  contributionThresholdSeconds` (20) is pre‑checked. `finalizeContribution` awards
  `contributionPoints` via `gamificationService.awardPoints` (idempotent per session×mentee).

### 6.5 Ending
- **"End & score"** button, **or** the Jitsi red hang‑up (`readyToClose` → `endAndScore`,
  made idempotent so both can't double‑fire). Runs `flushTalk` → `endMeeting` →
  `proposeContribution` → shows the scoring modal.
- After a refresh, a call with `meeting_ended_at` set shows **"Start a new call"** (not
  "Resume"), matching the just‑ended state.

---

## 7. The self‑hosted Jitsi server (`meet.pathment.me`)

One Oracle Cloud VM (Ampere ARM, Ubuntu 22.04). Standard Jitsi Meet quick‑install +
Let's Encrypt. Components (all `systemctl`, logs in `/var/log/prosody` and `/var/log/jitsi`,
**not** journald):

| Service | Role |
|---|---|
| **prosody** | XMPP signaling; hosts the rooms; `focus`/`jvb` auth; `client_proxy` routes conference requests to jicofo |
| **jicofo** | Conference focus — allocates the bridge for each room |
| **jitsi-videobridge2 (JVB)** | The SFU — forwards audio/video in real time (**discards it**, never stores) |
| **nginx** | Serves the web app + reverse‑proxies XMPP websocket / BOSH / colibri‑ws |
| **coturn** | TURN relay for restrictive networks |

**Key config files:**
- `/etc/jitsi/meet/meet.pathment.me-config.js` — client config served to browsers. Pathment
  overrides appended at the bottom: **`p2p.enabled=false`** (critical — see below),
  `prejoinConfig.enabled=false`, `enableWelcomePage=false`, `enableClosePage=false`.
- `/etc/prosody/conf.d/meet.pathment.me.cfg.lua` — virtualhosts, MUC components, `client_proxy`.
- `/etc/jitsi/videobridge/jvb.conf` + `sip-communicator.properties` — bridge; NAT harvester +
  colibri websocket.
- `/etc/jitsi/jicofo/jicofo.conf` — focus/bridge/xmpp.

**Non‑obvious things that must stay set** (full detail + fixes in `OPS-RUNBOOK.local.md`):
- **P2P disabled.** With 2 participants Jitsi defaults to peer‑to‑peer, bypassing the JVB —
  which kills dominant‑speaker detection (talk‑time reads 0). Must be OFF so calls always use
  the bridge.
- **NAT harvester** (`sip-communicator.properties`): map private↔public IP or media fails
  (Oracle 1:1 NAT).
- **`cjson.safe` for Lua 5.4**: prosody 13 runs on Lua 5.4, but the jitsi prosody modules need
  lua‑cjson built for 5.4 or they silently fail and conferences never form.
- **jicofo roster authorization**: jicofo must accept the `client_proxy` presence subscription
  (`subscription="from"` in `focus.dat`) or every conference request is rejected and
  participants are isolated at "1 participant".

**No recording:** Jibri is not installed. Nothing writes media to disk.

---

## 8. File reference

### Backend (`server/`)
| File | What it does |
|---|---|
| `src/config/reviewMeeting.js` | Feature flags / thresholds (§3) |
| `src/services/reviewMeetingService.js` | **Core.** `startMeeting`, `endMeeting`, `hostView`, `activeForMentee`, `selfPresent`, `selfLeave`, `recordTalkTime`, `proposeContribution`, `finalizeContribution`, `setAttendanceTracking`, `config`, `_notifyMenteesStarted` |
| `src/controllers/reviewMeetingController.js` | Thin HTTP handlers → service |
| `src/routes/mentor.js`, `src/routes/mentee.js` | Route wiring (§5) |
| `src/models/scheduling/CohortReviewSession.js` | Session model + meeting columns + `attendanceTracking` |
| `src/models/scheduling/CohortReviewEntry.js` | Per‑mentee attendance/talk/contribution |
| `src/services/cohortReviewService.js` | `_reconcileEntries` (creates clan roster entries), session CRUD |
| `src/socket/index.js` | `emitToUser` for `review:started` |
| `scripts/migrations/083_review_meeting.js` | Adds meeting columns |
| `scripts/migrations/084_review_attendance_tracking.js` | Adds `attendance_tracking` |

### Frontend (`client-interface/`)
| File | What it does |
|---|---|
| `components/shared/JitsiRoom.tsx` | Embeds Jitsi via `external_api.js`. `configOverwrite` (p2p off, prejoin off, no third‑party‑requests so avatars load). Surfaces events: `videoConferenceJoined` (+local id), `readyToClose`, `dominantSpeakerChanged`, `displayNameChanged`, `onSelfDominantChange`. Sets each user's Cloudinary avatar. |
| `components/mentor/ReviewMeetingPanel.tsx` | Mentor host panel: start/resume/end, roster, "Track attendance" toggle, mentor talk tracking (`onDominant`/`flushTalk`, 15s span cap), contribution modal, "coming soon" gate via `getReviewMeetingConfig` |
| `components/mentee/ReviewJoinBar.tsx` | Mentee banner (poll + `review:started` socket), join modal, `selfPresent` on join, **15s heartbeat**, self‑report talk time (`onSelfDominant`, 15s span cap) |
| `components/shared/ComingSoon.tsx` | Reusable "coming soon" teaser (use for any gated feature) |
| `lib/services/mentor-api.ts` | `getReviewMeetingConfig`, `getReviewMeeting`, `start/endReviewMeeting`, `setReviewAttendanceTracking`, `recordReviewTalkTime`, `propose/finalizeReviewContribution`, `markReviewPresent` |
| `lib/services/mentee-api.ts` | `getActiveReview`, `joinReview(id, talkSeconds?)`, `leaveReview` |
| `lib/services/socket-client.ts` | `getSocket()` for the `review:started` listener |
| `app/mentor/review/page.tsx` | Mounts `ReviewMeetingPanel` (draft session has `id:''`) |
| `app/mentee/layout.tsx` | Mounts `ReviewJoinBar` on all mentee pages |

---

## 9. Deploy

- **Frontend:** `git push origin staging` → Vercel staging. `./promote.sh` (repo root, gitignored)
  fast‑forwards `staging`→`main` → Vercel prod + Heroku.
- **Backend:** staging = DO container picks up the `staging` branch; prod = Heroku on `main`.
- **Prod migrations (manual — Heroku doesn't auto‑run):**
  ```
  heroku run "node scripts/migrations/083_review_meeting.js" -a pathment-api
  heroku run "node scripts/migrations/084_review_attendance_tracking.js" -a pathment-api
  ```
- **Jitsi server:** one box for both envs. Config changes there (e.g. `config.js`) apply to
  staging **and** prod immediately — no app deploy needed.
- **Turn it on in prod:** `heroku config:set REVIEW_MEETING_ENABLED=true JITSI_DOMAIN=meet.pathment.me -a pathment-api`.

---

## 10. Known limitations & design decisions

- **Talk time is an estimate, not a stopwatch.** Jitsi only gives "dominant speaker", which
  persists through silence. We cap each span at 15s. Trade‑off: a *single uninterrupted
  monologue* under‑counts (capped at 15s); normal back‑and‑forth accumulates fairly. The
  mentor can always award the point manually. Tunable via `SPEAK_SPAN_CAP` (client) and
  `REVIEW_CONTRIBUTION_SECONDS` (server).
- **Attendance is per‑call, not per‑session‑history.** Restarting a meeting resets the
  per‑call attendance (keeps manual marks). There is no per‑meeting attendance history.
- **No media is stored** anywhere (no Jibri). Only metadata.
- **Identity link is the display name / self‑report**, since Jitsi guests carry no Pathment
  ID. Mentees set their Jitsi display name = Pathment full name; the mentee self‑reports its
  own presence/talk, which is authenticated and reliable.
- **Provider‑flexible:** all Jitsi coupling is `JITSI_DOMAIN`. Pointing at JaaS/8x8 or a new
  self‑host is an env change (JWT would be extra work).

---

## 11. Troubleshooting quick pointers

| Symptom | Look at |
|---|---|
| Feature not showing / shows "coming soon" wrongly | `REVIEW_MEETING_ENABLED` / `COMING_SOON`; `getReviewMeetingConfig` runs independent of a session |
| Mentee gets no Join banner | `activeForMentee` (clan membership, 3h staleness, `meeting_ended_at`), socket `review:started`, `JITSI_DOMAIN` matches on both sides |
| "1 participant" / can't see each other | **server side** — prosody `cjson`, jicofo `client_proxy` roster subscription (see runbook); check `grep -c "Created new conference" /var/log/jitsi/jicofo.log` |
| Talk time = 0 | is the call P2P? (`curl localhost:8080/metrics \| grep endpoints_sending_audio` should be >0 while speaking). P2P must be OFF. |
| Talk time inflated | `SPEAK_SPAN_CAP`; and note fresh calls reset talk to 0 |
| Avatars show initials only | `disableThirdPartyRequests` must NOT be set; mentee `JitsiRoom` must receive `avatarUrl` |
| Cohort/review endpoints 500 in prod | a missing migration (083/084) — run it |

Server ops, credentials, IPs, and the deeper Jitsi fixes: **`OPS-RUNBOOK.local.md`** (gitignored).

---

## 12. Recurring review scheduling

A mentor can make a cohort review **repeat** (weekly or biweekly) instead of starting one by
hand each time. Each occurrence becomes a normal `CohortReviewSession` whose room **opens
itself at the scheduled time**, and everyone in the clan gets a calendar invite + reminders.

### 12.1 Data model
**`review_schedules`** (migration `085`, model `src/models/scheduling/ReviewSchedule.js`):
| Column | Purpose |
|---|---|
| `clan_id`, `mentor_id` | which clan, and the host |
| `title` | optional; defaults to "`<clan>` cohort review" |
| `day_of_week` | 0–6 (0 = Sunday) |
| `time_local` | `HH:mm` wall‑clock **in `timezone`** |
| `timezone` | IANA zone the wall‑clock is in (DST‑safe) |
| `interval_weeks` | `1` (weekly) or `2` (biweekly) |
| `duration_minutes` | default 60 |
| `starts_on` / `ends_on` | DATEONLY first eligible date / optional last date |
| `active` | BOOL; cancel flips this false |

Migration `085` also adds to **`cohort_review_sessions`**: `scheduled_at` (UTC instant the room
auto‑opens), `review_schedule_id` (back‑link), and `invites_sent_at` / `reminded_24h_at` /
`reminded_1h_at` (so invites/reminders fire exactly once). All additive — ad‑hoc sessions keep
working with these null.

### 12.2 How occurrences appear (materialisation)
`src/services/reviewScheduleService.js` is the core:
- `createSchedule` validates + creates the row, then `_materialize(sched, sendInvites=true)`.
- `_materialize` computes upcoming occurrences within a **14‑day horizon** via
  `src/utils/reviewRecurrence.js → nextOccurrences(schedule, from, count)` (DST‑safe: converts
  the wall‑clock `time_local`+`timezone` to a UTC instant with `zonedWallClockToUtc`), then for
  each calls `_findOrCreateSession` (one session per clan per date; pre‑creates the meeting room)
  and sends the invite once (`invites_sent_at` guard).
- `tick()` (below) re‑materialises active schedules hourly, so the horizon rolls forward.

### 12.3 Auto‑open (no minute‑precise cron)
There is **no** job that flips a session live at exactly HH:mm. Instead openness is computed at
**read time** in `reviewMeetingService`:
- `activeForMentee` treats a session as live if `meeting_started_at` is fresh **OR**
  `scheduled_at` has passed (and is within the freshness window) — so the mentee's Join banner
  appears the instant the time arrives.
- `hostView` stamps `meeting_started_at = scheduled_at` the first time the mentor opens a
  scheduled session whose time has passed. A late mentor never blocks anyone.

### 12.4 Invites & reminders (timezone‑correct + .ics)
`reviewScheduleService._email(session, schedule, kind)` where `kind ∈ {invite, 24h, 1h}`:
- recipients = the clan's mentees + the host; each rendered in **their own** timezone
  (`user_settings.timezone`, falling back to the schedule's) via `Intl.DateTimeFormat`.
- HTML via `src/utils/emailTemplate.js` (`renderEmail`/`plainText`), a calendar attachment via
  `src/utils/ics.js` (`buildEventIcs`, one VEVENT per occurrence; `REQUEST` for invite, `PUBLISH`
  for reminders), enqueued through `emailService.enqueue` with an idempotency key
  `revsched:<kind>:<sessionId>:<userId>` and the `.ics` as a base64 attachment.
- `emailService.enqueue` gained an `attachments` param (stored in `EmailQueue.metadata`, replayed
  by `_deliverViaResend`).

### 12.5 Scheduler
`reviewScheduleService.tick()` is driven by the hourly `notificationScheduler.run()`
(`runReviewSchedules()`): (1) materialise active schedules + send new invites, (2) 24h reminders
(23–25h window), (3) 1h reminders (0.5–1.5h window). The wide windows + the `reminded_*_at` flags
make it safe to run hourly without duplicates.

### 12.6 API + UI
| Method + path (`mentor.js`) | Does |
|---|---|
| `GET /mentor/review/schedules` | list the mentor's schedules |
| `POST /mentor/review/schedules` | create (validates clan ownership) |
| `DELETE /mentor/review/schedules/:id` | cancel: `active=false` + finish future not‑started sessions |

Frontend: **`components/mentor/ReviewScheduleDrawer.tsx`** (opened by a **Schedule** button in
`app/mentor/review/page.tsx`) — lists/cancels active schedules and a create form (clan, day,
time, weekly/biweekly, duration, start/optional end). Time is captured in the mentor's **browser
timezone**; each recipient still sees the invite in their own. API in `lib/services/mentor-api.ts`
(`listReviewSchedules`, `createReviewSchedule`, `cancelReviewSchedule`).

---

## 13. Admin review records (reporting)

Read‑only org reporting over the review data mentors fill in. **Never mutates** a review record
(deletion stays behind the existing admin lock).

- Service **`src/services/reviewRecordsService.js`**: `orgReviewRecords({clanId, mentorId, from,
  to})` returns `{ summary, byClan, byMentor, sessions }` (attendance %, talk‑time totals, session
  counts, live‑video counts), and `sessionDetail(id)` for the per‑mentee drill‑in.
- Controller `reviewRecordsController.js`; routes (`admin.js`, gated by `analytics.view`):
  `GET /admin/review-records` and `GET /admin/review-records/:id`.
- Frontend **`app/admin/review-records/page.tsx`** (Analytics nav → "Review Records"): filters
  (clan / mentor / date), KPI cards, **by‑clan** & **by‑mentor** tables, a sessions table, and a
  session‑detail drawer with each mentee's attendance, talk time and contribution points. API in
  `lib/services/admin-api.ts` (`reviewRecords.list/detail`). **No migration.**

---

## 14. Admin‑hosted live meetings (org broadcasts)

An admin schedules a live meeting and picks **who's invited**; attendees get a calendar invite +
reminders and a live **Join banner**. The call reuses the same shared `JitsiRoom`.

### 14.1 Data model
**`admin_meetings`** (migration `086`, model `src/models/scheduling/AdminMeeting.js`):
| Column | Purpose |
|---|---|
| `host_id` | the admin who created it |
| `title`, `description` | |
| `scheduled_at`, `duration_minutes` | UTC start + length |
| `audience_type` | `mentors` \| `clan` \| `both` |
| `clan_id` | required for `clan` / `both` |
| `meeting_provider` / `meeting_room` / `meeting_url` | shared Jitsi room (reuses `reviewMeeting` provider config) |
| `status` | `scheduled` \| `live` \| `ended` \| `cancelled` |
| `started_at`, `ended_at` | |
| `invites_sent_at`, `reminded_24h_at`, `reminded_1h_at` | fire‑once guards |

### 14.2 Audience resolution
`adminMeetingService.audienceUserIds(meeting)` (always includes the host):
- **`mentors`** → every active mentor (`User where role=mentor, status=active`).
- **`clan`** → that clan's mentees (`cohortService.resolveMenteeIdsForClan`) **+** that clan's
  mentors (`ClanMembership` roles lead/co/core).
- **`both`** → every active mentor **+** that clan's mentees.
`isInAudience(meeting, userId)` gates joining.

### 14.3 Lifecycle
- `createMeeting` validates, generates the room, creates the row, sends invites, stamps
  `invites_sent_at`.
- `startMeeting` → `status=live` + `started_at`; `endMeeting` → `status=ended` + `ended_at`;
  `cancelMeeting` → `status=cancelled`.
- `tick()` (hourly, via `notificationScheduler.runAdminMeetings()`): 24h/1h reminders **and**
  **auto‑ends** meetings whose window ended > 2h ago and were never closed.
- Invites/reminders use the same `emailTemplate` + `ics` + `emailService.enqueue` path as §12.4,
  idempotency key `adminmtg:<kind>:<meetingId>:<userId>`.

### 14.4 API
| Method + path | Gate | Does |
|---|---|---|
| `POST /admin/meetings` | `analytics.view` | create + invite |
| `GET /admin/meetings` | `analytics.view` | list (non‑cancelled) |
| `POST /admin/meetings/:id/start` \| `/end` | `analytics.view` | go live / end |
| `DELETE /admin/meetings/:id` | `analytics.view` | cancel |
| `GET /meetings/live` | any auth user | admin meetings **this user** can join now/soon (banner) |
| `GET /meetings/admin/:id/join` | any auth user | room details, **audience‑gated** |

The two attendee routes live in `src/routes/meetings.js` (declared before its generic `/` and
`:id` handlers so they aren't shadowed); controller `adminMeetingController.js`.

### 14.5 Frontend
- **`app/admin/meetings/page.tsx`** (Engagement nav → "Live Meetings"): schedule + manage
  (start/end/cancel); the host joins inline via the overlay.
- **`components/shared/LiveMeetingBanner.tsx`** — mounted once in `Navigation` (so **every** role
  sees it), polls `/meetings/live` every 45s, shows a "Live now" card when an invited meeting is
  live, dismissable per meeting.
- **`components/shared/LiveMeetingOverlay.tsx`** — full‑screen wrapper that fetches the gated join
  info and embeds `JitsiRoom`; reused by the banner **and** the admin page's host‑join.
- APIs: admin CRUD in `lib/services/admin-api.ts` (`meetings.*`); attendee in
  `lib/services/live-meeting-api.ts` (`live`, `join`).

---

## 15. Deploy notes for §12–§14

- **Prod migrations** (in addition to 083/084):
  ```
  heroku run "node scripts/migrations/085_review_schedules.js" -a pathment-api
  heroku run "node scripts/migrations/086_admin_meetings.js" -a pathment-api
  ```
  (085 applied to staging's DB already; 086 not yet applied anywhere at time of writing.)
- **`API_PUBLIC_URL`** must be set on the API — used for the one‑click unsubscribe link and the
  `.ics` URLs.
- Reminders ride the **existing hourly** `notificationScheduler` — nothing new to schedule.
- Scheduling/records/meetings are **not** behind `REVIEW_MEETING_ENABLED`; they use the same
  `JITSI_DOMAIN` for the room. (If the base call is still in "coming soon" in prod, the
  scheduled‑review rooms will point at `JITSI_DOMAIN` regardless.)
- Email inbox placement still needs **SPF/DKIM/DMARC** configured in Resend.
