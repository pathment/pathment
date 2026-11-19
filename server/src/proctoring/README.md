# Proctoring, server side

- `rules.js`: what a client must be able to do before an attempt starts (screen share, video recording), recording limits, and where recordings are stored.
- `media.js`:
  - the proctor log: an append-only `jsonb` on the host's attempts table, registered with `registerLogTable`;
  - snapshots and video answers (a signed direct upload, or through us as a fallback);
  - the reviewer summary, `splitProctorLog`, which returns snapshots, flags, counts and `stats` (resumes, time away, offline time, time out of fullscreen).

Hosts today: interviews (`interview_sessions`), quizzes (`quiz_sessions`) and intake assessments (`assessment_submissions`).

To wire up a new system, see the full guide at `client-interface/lib/proctoring/README.md` (server and client).
