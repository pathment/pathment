# Programs, Cohorts & Clans

**What it is:** the org structure everything hangs off. A **Program** is the offering; a
**Cohort** is a season of intake for it; a **Clan** is a mentor-led group of mentees inside
the program; **ClanMembership** records who's in a clan and in what role.

**Why it exists:** mentorship scales by grouping. Instead of 1:1 chaos, mentees are placed
into clans led by mentors, within a program, admitted via a cohort.

## Data model
`Program` (type, status `draft|published|archived`, visibility `private|public`,
enrollments). `Cohort` (intake season - see [Intake](./intake-and-assessments.md)). `Clan`
(programId, leadMentorId, maxMentees, healthStatus, optional `inviteSlug` + `inviteEnabled` for a reusable join link). `ClanMembership` (clanId, userId, role
`lead_mentor|co_mentor|mentee|core_team`, status, enrollmentId). `ClanChangeRequest`
(permanent move between clans). `CrossClanAssignment` (temporary cross-clan help:
`cover|specialist|co_mentee_access`, with `status` `pending|active|declined` - only
`active` grants access). See [DATABASE.md §5](../DATABASE.md).

## Backend
- **Programs (`/api/programs`):** list (public sees published+public; admins/creators see all), detail, create/clone (mentor+admin), update/delete (ownership-checked), stats, enrollments.
- **Clans (`/api/clans`):** list, detail, `me/memberships`, `mentor/programs`, `health` + `insights` (`analytics.view`), create (`clan.create`), update + member add/remove (`clan.manage_members` scoped to the clan). `GET/POST/DELETE /:id/invite-link` (lead mentor or `mentee.add`) mints a reusable `/join/<slug>` URL. `clanService.addMember(clanId,{userId,role})` is how a co-mentor/core-team member is added - and the authz engine derives that person's clan permissions from the membership.
- **Public clan join (`/api/public/clans/:slug`):** preview; `POST .../join` (authenticated) auto-joins as a mentee; `POST .../request-invite` emails a clan-scoped registration invite for new accounts.
- **Clan requests (`/api/clan-requests`):** change-request create (mentee) + resolve (admin); **cross-clan list/create/remove** gated by `clan.manage_members` *scoped to the target clan* - so admins manage org-wide **and a clan's lead mentor self-serves cover for their own clan**. **Consent-first:** `cross-clan/mine` (the addressee's inbox) + `cross-clan/:id/respond` (accept/decline) - a lead's request is `pending` until the person accepts; an admin-created assignment is `active` at once.

## Frontend
- **Admin:** `/admin/programs/list` + `/admin/programs/[id]`, `/admin/clans`, `/admin/requests` (change requests, cross-clan), `/admin/insights` (clan health/fairness).
- **Mentor:** `/mentor/programs` (+ `[id]`) - programs they run; **`/mentor/clan-team`** - manage their clan's co-mentors/core-team **and request cross-clan cover/specialist help** for their clan (lead mentors only). Lead mentors can also **enable a shareable join link** from Clan Team.
- **Public:** `/join/[slug]` — anyone with the link can log in to join, or request a registration email that places them in that clan.
- **Mentee:** sees their clan implicitly (via enrollment + community space).

## Role flows
- **Admin:** creates programs, opens cohorts, creates clans, assigns lead mentors, places mentees (via accept/enrollment), resolves clan change requests, and sets up cross-clan help (cover/specialist).
- **Lead mentor:** runs their clan - adds **co-mentors / core-team** on the Clan Team page, can **enable a shareable join link** (`/join/<slug>`) so people can join without a per-email invite, **requests cross-clan cover** (e.g. while on leave), renames the clan; reviews/mentors its members. Requesting cover **notifies the person to accept** (in-app + email, `cross_clan_assigned`) and sends **admins an in-app oversight notification** (`/admin/requests?tab=cross`); access is granted only once the person accepts, and the requester is notified of the accept/decline.
- **Covering person:** sees pending requests at the top of their **Clan Team** page (and via the notification) and **accepts or declines**; on accept they gain temporary co-mentor access to that clan until it's removed (they're notified then too).
- **Co-mentor:** mentors within the clan (review tasks, see mentees) but **cannot** change membership.
- **Mentee:** belongs to one clan; can request a clan change (admin resolves).

## Rules & edge cases
- Program `visibility` gates discovery: only published+public programs appear to non-admins / the public catalog.
- Clan roles are the clan-scoped half of [RBAC](./authorization-rbac.md) - membership *is* the grant.
- **Clan change request = permanent move; cross-clan assignment = temporary, revocable help.** Don't confuse them.
- A clan has one lead mentor (`leadMentorId`); the first mentor added becomes lead.
- A clan join link only works while `inviteEnabled` is true and the clan is `active`; disabling keeps the same slug so re-enabling doesn't break already-shared URLs. New users still register via a clan-scoped `RegistrationInvite` (email-proven); existing accounts auto-join.

## Related
[Intake & Assessments](./intake-and-assessments.md) · [Enrollment & Progress](./enrollment-and-progress.md) · [Matching & Placement](./matching-and-placement.md) · [Authorization](./authorization-rbac.md)
