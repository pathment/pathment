# Intake & Assessments

**What it is:** the self-serve admissions pipeline - a public program catalog, shareable
cohort apply links, applications with admin review, admin-built assessments of any type, and
the accept → invite → register → placement flow. Whatever's collected up front **carries
forward** so the mentee never re-types it.

**Why it exists:** intake used to be spreadsheets + Forms + manual invites. This turns
"recruit → assess → place" into one structured, idempotent flow.

## Data model
`Cohort` (a program's intake season; `status planning→open→closed→running→completed`, plus
`publicSlug`, `publicEnabled`, apply window/cap, `intakeFormSchema`, `assessmentId`,
`assessmentRequired`). `Application` (free-form `responses` JSONB, `status`, `assessmentScore`,
`accessTokenHash` magic-link, `inviteId`, `userId`). `Assessment` + `AssessmentQuestion`
(mcq / multi_select / short_text / long_text / file_upload / external_link) +
`AssessmentSubmission` (answers, auto/manual/total score). `RegistrationInvite` carries the
placement. See migration 031/043.

## Backend
- **Public (`/api/public`, no auth):** `GET /programs`, `GET /programs/:id`, `GET /cohorts/:slug` (apply info), `POST /cohorts/:slug/apply`, `GET /applications/:token` (status + sanitized assessment), `POST /applications/:token/assessment`, `POST /applications/:token/upload`.
- **Admin intake (`/api/intake`, `intake.manage`):** cohort CRUD, `public-link` enable/disable, `clone-intake`, get-or-create `assessment`, application list/import/detail/accept/reject, `assessment-submissions/:id/grade`.
- **Assessment authoring (`/api/assessments`, `assessment.author`):** CRUD + `PUT /:id/questions`.
- **Services:** `publicIntakeService` (catalog, apply, magic-link, auto-grade), `assessmentService` (authoring + grading + sanitize), `cohortIntakeService` (cohorts, public link, clone), `applicationService` (review, accept). Auto-grades MCQs on submit; correct answers are never sent to applicants. Carry-forward: `config/intakeProfileFields.js` maps application answers → User/MenteeProfile at register, auto-completing onboarding.

## Frontend
- **Public:** `app/(public)/programs` (catalog), `/programs/[id]`, `/apply/[slug]` (form builder fields), `/apply/status/[token]` (status + assessment runner, all question types incl. file upload).
- **Admin:** `/admin/cohorts` + `/admin/cohorts/[id]` (public-link panel, form builder, attach/create assessment, applicant review with submission + grading, live preview); `/admin/assessments` + `/admin/assessments/[id]` (assessment library + builder).

## Role flows
- **Applicant (no account):** browse `/programs` or open a cohort link → fill the form (name/email + admin-configured fields) → get an emailed magic link → take the assessment if required → track status.
- **Admin / Intake manager:** create a cohort → build the application form + attach/create an assessment → enable the public link (or import a CSV) → review applications (see answers + assessment + score) → **Accept** (issues an invite placing them into a program + optional clan) or reject. Can **clone** a previous cohort's setup.
- **Mentee (after accept):** registers via the invite; their intake answers are already on their profile (onboarding pre-filled).

## Rules & edge cases
- A link only accepts applications while the cohort is `open`, inside its window, and under its cap.
- One application per (cohort, email); re-applying resumes a pending one; decided ones are locked.
- An email that already has a Pathment account applies like any other: the form is public and
  nobody can know which addresses we hold, so it is never refused at the last step. Accepting
  them issues the same placement invite, but the email says "you're in, sign in and join"
  (`notificationOrchestrator.sendProgramAcceptedEmail`) instead of "set up your account"; opening
  it while signed in places them (`authService.acceptRegistrationInvite`).
- MCQ/multi-select auto-grade; text/file/link need manual grading; `assessmentScore` mirrors onto the application.
- Levels: `selfSelectedLevel` is what the applicant picked and never changes; `level` is what they
  are treated as and is overwritten by the automatic review; `recommendedLevel` is the review's own
  answer. The review is decided on the self-selected value, never on its own previous output, and it
  is skipped when the evidence behind the last run is unchanged (`levelEvidence.fingerprint`) — a
  re-rolled level swaps the candidate's level-targeted pool work and emails them about it.
- The standalone Assessments library lets you reuse an assessment across cohorts.

## Proctoring

An intake assessment is a proctoring host like a quiz or an interview
(`assessment_submissions`; see `server/src/proctoring/README.md`). Two gates, and
they are not the same gate:

- **The browser's own**, in `components/apply/AssessmentRunner.tsx`: `startFromSetup`
  refuses to call `start` until a screen share is **live** and a camera track actually
  exists. Support is not permission — a browser that *can* share a screen on a page where
  nobody granted it would still declare itself capable.
- **The server's**, in `publicIntakeService.startAssessment`: it reads the capabilities the
  browser declared and refuses with the one that is missing named (`screen` or `video`)
  before any attempt row exists, so no clock starts for a client that cannot be proctored.

The record is append-only on the attempt. Snapshots are stored images and are kept apart
from flags; a snapshot claimed through the plain events endpoint is dropped, because that
would be a flag-shaped hole pointing at any URL the client liked. When the clock runs out
the server closes the attempt and writes its own `time_expired` entry, so the log ends
with a reason rather than mid-sentence, and nothing of the applicant's is accepted after.

A reviewer reads `splitProctorLog`: the snapshots, the flags with counts, and the
interruptions totalled — opens, resumes, time away, time offline, time out of fullscreen —
which is what tells a power cut apart from a second browser. The raw log never leaves the
server.

Covered by `server/tests/pools/intake-assessment-proctoring.test.js` (12) and
`client-interface/tests/assessment-proctoring-gate.test.cjs` (4).

## Related
[Authentication](./authentication.md) · [Programs, Cohorts & Clans](./programs-cohorts-clans.md) · [Authorization](./authorization-rbac.md) · [Profile & Settings](./profile-skills-settings.md) (carry-forward target)
