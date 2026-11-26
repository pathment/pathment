# System Pool (pre-clan selection)

**What it is:** a real pre-clan state for people who are on the platform but not yet in a
clan. Operators put candidates in a pool, give them existing Pathment work (tasks, quizzes,
interviews), review it, score it, shortlist, decide, and only then place the chosen ones
into clans with their mentor team.

**Why it exists:** task assignment assumed every person is a mentee in a clan. Selection
rounds (e.g. 300 candidates → 50 places) happen *before* that. Fake "holding" clans would
corrupt enrollment, progress, analytics and permissions, so the pool is its own state.

## Data model
Migrations `140_candidate_pools` (two tables, one column) and `142_pool_photo` (one column), all additive.
- `CandidatePool` — programme-bound round: status `draft → open → qualifying → reviewing → placing → closed`
  (+ `archivedAt`), `selectionQuota`, `capacity`, dates, `avatarUrl`, versioned `scoringPolicy`
  (`{ version, mode: 'points', difficultyPoints: { easy, medium, hard, expert } }` — the curve a new
  piece of work takes its points from), `reminderPolicy`, `settings`
  (`autoAssignOnActivation`, `waitlistSize`, `targetClanIds`), and
  `workItems` — the pool's work, one entry per piece (`kind`, its own task template `roadmapTaskId`,
  `points`, `required`, `dueAt`, kit `config`, and who it is for: `levels` + `forEveryone`).
  Edited under a row lock.

## Who a piece of work is for
A candidate gets the work aimed at **their** level and nothing else (`poolService.targetsMember`):

| `levels` | `forEveryone` | round has levels | reaches |
| --- | --- | --- | --- |
| `['level-2']` | — | yes | candidates at `level-2` only; a candidate with no level, never |
| `[]` | `true` | yes | everyone, because an admin said so |
| `[]` | falsy | yes | **nobody** — it has not been aimed yet |
| `[]` | — | no | everyone; there is nothing to aim at |

The round's levels are `poolService.levelsFor`: every cohort it draws from (`cohortId` **and**
`settings.autoAddFromCohortIds`) plus any level its candidates actually carry. Reading only
`cohortId` left an intake-fed pool with an empty list, so the work screen never offered the level
picker, every piece was saved aimed at nobody — which used to mean *everyone* — and one candidate
received all three levels' courses at once.

Aiming is changed in place (`PATCH /pools/:id/assignments/:id` with `levels` / `forEveryone`), so
work already handed out is re-aimed rather than cancelled and re-added. Re-aiming does not withdraw
what a candidate already holds; `cancelForMember` does that. Only work aimed at a *different* level
is taken back when a candidate's level changes (`poolService.aimedElsewhere`) — unaimed work is not
"the wrong level", so a course in progress never loses its provider seat to a level edit.
- `PoolMember` — one per (pool, email). `userId` is NULL while only invited. Separate tracks:
  `status` (invited/active/qualifying/reviewing/completed), `decision`
  (selected/waitlisted/not_selected/withdrawn/disqualified), and `placedAt` (set only once enrollment and
  clan membership exist). JSON fields: `details` (names, source, activatedAt), `manualScores`
  (one key, `adjustment`: points added to or taken off their total, with a note),
  `placement` (pending/failed, target clan, error, attempts), `reminders` (each reminder sent).
- `AssignedTask.poolMemberId` — NULL for ordinary work. Partial unique index on
  `(pool_member_id, roadmap_task_id)`: the same work reaches the same member once.
- Shortlists live in `audit_logs`: `POOL_SHORTLIST_GENERATED` (version, fingerprint, policy, quota,
  blockers, full ranking) and `POOL_SELECTION_CONFIRMED` (final outcomes, override reasons). The confirmed
  result is also written onto each `PoolMember` (decision, `scoreComponents`, `totalScore`, `rank`).

## The fence (most important rule)
Pool work must never appear in a clan — before placement, and above all after it.
- `AssignedTask` has a **default scope** `poolMemberId IS NULL`. Every existing query (lists, counts,
  bulk updates, includes) sees ordinary work only. Code that handles pool work opts in with
  `AssignedTask.scope('withPoolWork')` and then authorises itself (ownership, or `canActOnTask`).
- Raw SQL that reads `assigned_tasks` filters explicitly (`cohortService.taskSql`, badge counts,
  standing-clan mirror).
- `authzService.scopeOfAssignedTask` resolves pool work to the **pool's programme**, never a clan.
  `canActOnTask` requires `pool.review` for pool work — a clan mentor never qualifies, and nobody
  reviews their own work.
- The workspace boundary is a hook, not a scope: opting in never crosses workspaces.

## Scoring: points, not percentages
A score is **points earned**, and every point traces to one piece of work.

- Each piece of work is worth a number, set when it is added — defaulted from its difficulty through
  the pool's own curve, and editable per piece afterwards (`PATCH /pools/:id/assignments/:id`).
  Re-pricing applies to work already handed out, and is refused once a selection is confirmed.
- A candidate earns `points × rating ÷ 5` on work whose latest review approved it, the full points
  when approved without a rating, and 0 otherwise. Quiz and interview reviews store their result on
  the same 0–5 rating, so one rule covers every kind of work.
- `manualScores.adjustment` is the only hand-typed number: points on top, or off, for a judgement
  made away from the platform. Always shown on its own line, always with a note, always audited.
- Ranking is by total points; `possible` (what a perfect round is worth) is returned beside it, so a
  total reads without knowing how the pool was set up.
- Blockers: `no_work` (nothing to rank on) and `reviews_outstanding` are hard; a tie at the cutoff
  still blocks until each tied candidate is decided with a reason. Warnings cover missing work and
  required work a candidate was never given.

This replaced a policy of weighted components totalling 100%. That asked an operator to describe one
round twice — as the work they hand out, and again as the percentages it feeds — and the two drifted:
a component with no work behind it scored everybody 0 and blocked the shortlist, and the number a
candidate earned for a project could not be read off the project. Older pools keep whatever
`components` they stored; scoring ignores it.

## Backend
- **Services:** `poolService` (pools, transitions, dashboard, history, the points curve),
  `poolMemberService` (import/invite/applications/withdraw/disqualify/adjustment/activation),
  `poolTaskService` (work, bulk roadmap steps, re-pricing, idempotent assignment to everybody or to
  one person), `poolReviewService` (queue, review via `submissionService`), `poolScoringService`
  (scores, shortlist, confirm, decisions), `poolPlacementService` (preview, plan, idempotent
  placement via `clanService.addMember`), `poolReminderService` (hourly, from
  `notificationScheduler`), `poolCandidateService` (self-only reads), `poolAvatarService` (the
  photo, same two-step flow as `clanAvatarService`), `poolWorkEvents` (the shared engine's pool
  hooks).
- **Shared engine reused:** `submissionService.submitTaskWithFiles` / `reviewSubmission`, the quiz and
  interview runners. For pool work: never any points, no streaks/badges/mentor
  stats, no roadmap advance, reviewers (not a mentor) are notified, writes freeze once the pool closes
  or the candidate has a decision.
- **API `/api/pools`** — each route checks a specific permission at the pool's programme:
  `pool.manage` (create/configure/status/photo), `pool.members` (import, invite, applications,
  withdraw, disqualify), `pool.assign` (add work, re-price it, hand it to everybody or to one
  candidate), `pool.review` (queue, review, the hand adjustment), `pool.select` (shortlist, confirm,
  decisions, placement); any pool permission reads.
- **API `/api/candidate`** — self only: pools, tasks, task detail, start, submit.
- **Roles:** `pool_operator` (all five, programme scope), `pool_reviewer` (`pool.review`); `program_admin`
  holds all five. None is admin-tier: `hasPoolAccess` opens Selection pools only.

## Frontend
- **Admin → Admissions → Selection pools** (`/admin/pools`, `/admin/pools/[id]`): Overview,
  Candidates, Work, Review, Scores & shortlist, Placement, Settings, History. Shown to anyone with a
  `pool.*` permission; pool-only roles see nothing else in the admin area.
- **Adding work** (`WorkTab` + `RoadmapStepPicker`): the roadmap is the unit. Open a roadmap, read
  its steps in teaching order, tick several, add them in one request — `POST
  /pools/:id/assignments/from-roadmap`, which reports each step as added, skipped (already there) or
  failed. A step that is a quiz or an interview is shown and explained rather than dropped. The other
  tab writes one custom piece, or hands out a quiz or interview kit. Points are shown and editable
  beside each piece, inline.
- **Handing work out** (`AssignWorkDrawer`) goes both ways: one piece of work → chosen candidates
  (searchable, with avatars, showing who already holds it), or one candidate → chosen pieces of work
  (from their row in Candidates). "Give to everyone" stays one click.
- **Intake → a cohort → select applicants → "Add to pool"**: puts the selected applicants into any open
  pool. One pool can gather applicants from several cohorts, of several programmes — but only programmes
  whose intake the person adding them runs (`intake.manage` there; the pool's own programme always counts).
  A pool has no cohort of its own: selected people are placed in the pool's programme's clans, and their
  enrollment takes the cohort they applied through when it is that programme's. Their applications are not
  changed — Accept & invite and clan placement work as before.
- **The candidate is a learner in pool scope.** There is no separate candidate area: a selection
  pool appears in the learner workspace's scope picker under its own **Selection pool** heading,
  beside any clans they are in, with its photo. Picking it turns `/mentee/dashboard` into their
  round (`PoolQualification`) and `/mentee/tasks` into their qualifying work (`PoolWorkList`); one
  piece opens at `/mentee/tasks/:id?pool=1` (`PoolTaskDetail`), and the quiz and interview runners
  are the mentee ones.

  **It is the same screens, not lookalikes.** `/mentee/tasks` in pool scope is the clan task screen
  with the round's wording: the four counts, the Active/Approved switch, search and a status filter,
  and `MenteeTaskRow` - one component for a clan task and a round's work alike, because to the person
  doing it they are the same object. The shared `TaskDrawer` and `SubmitTaskDrawer` take a
  `source` (`clan` | `pool`) and read or hand in through the candidate API, so a round never grows a
  second submission form. `/candidate/tasks` therefore returns what a clan task carries - difficulty,
  estimated hours, description, and `points` - where `points` is what the work is WORTH; a candidate
  is never shown their score or their rank.

  In pool scope the nav keeps only This Week, Tasks and Settings: progress, meetings, roadblocks,
  the community and messages are all about a mentor, a roadmap or a cohort that does not exist until
  placement. Settings drops Skills and Learning preferences for the same reason — both write to a
  mentee profile that is created when somebody is placed. `RoleGuard permitCandidates` lets them in
  (`candidate` is not a portal role), and `OnboardingGuard` does not walk a pool-only candidate
  through the learner onboarding.

  The scope lives in one place (`ClanContext.menteeScope`, a clan id or `pool:<id>`), but a pool is
  never passed off as a clan: `menteeActiveClanId` is empty in pool scope and the `X-Active-Clan`
  header is omitted, because the server drops a non-uuid and then answers as if no clan had been
  chosen, which for a learner in more than one clan is a 400. For the same reason the learner home
  waits for `useMenteeScope().loading` before choosing which screen to render, rather than opening
  the clan home and swapping it out.

  `/candidate/*` remains as redirects, because notifications sent before the move carry those URLs
  in `action_url` for as long as the account lives.

## Role flows
- **Operator:** create pool → set scoring and reminders → add candidates (CSV/emails/applications) →
  add work (linked to score components) → watch the dashboard → generate shortlist → resolve ties /
  missing reviews → confirm → plan placement → place (retry failures).
- **Reviewer:** Review tab → open a submission → rate 0–5 (the score input) + approve or request
  changes; enter hand scores for `manual` components.
- **Candidate:** invitation → register (a candidate account, no mentee profile) → My qualification →
  hand in work / take quizzes and interviews → read feedback, resubmit → see the outcome → after
  placement, the mentee portal.
- **Mentor:** hears only when a selected candidate is placed in their clan.

## Rules & edge cases
- Pool membership never creates an enrollment or clan membership; placement does, through the
  normal path, and is what creates the mentee profile.
- Activation links pool memberships **by email**: registering through *any* invitation to that
  address activates them (one active invitation per email is a database rule).
- Score = Σ component score × weight. Reviewed work: latest approved rating × 20. Unreviewed
  submissions block confirmation; missing work scores 0 (warned).
- A tie at the cutoff blocks confirmation until every tied candidate is decided with a reason; every
  change to a proposed outcome needs a reason; all decisions are audited against the pool.
- Placement locks the clan row and checks capacity (`maxMentees`) and an active lead mentor; a
  failure marks only that person `failed`. Retrying never duplicates enrollments or memberships.
- Reminders stop at send time when work is handed in, the candidate exits or is decided, or the
  pool closes. Invitation reminders reissue the link (only its hash is stored).

## Related
[Intake & Assessments](./intake-and-assessments.md) · [Roadmaps & Tasks](./roadmaps-and-tasks.md) ·
[Authorization](./authorization-rbac.md) · [Programs, Cohorts & Clans](./programs-cohorts-clans.md) ·
[Notifications](./notifications-and-email.md)
