/**
 * Standard task points — the single source of truth.
 *
 * A task's points are determined ENTIRELY by its difficulty, so the same
 * difficulty always earns the same points for every mentee. Mentors set
 * difficulty; points follow. This keeps grading consistent and the leaderboard
 * fair/ungameable (no hand-typed per-task numbers).
 *
 * To re-tune the curve org-wide, change it here (or later, surface it as an
 * admin setting in system_settings and read the override before falling back).
 */
const TASK_POINTS_BY_DIFFICULTY = Object.freeze({
  easy: 5,
  medium: 10,
  hard: 20,
  expert: 40,
});

// Fallback when a difficulty is missing/unknown (difficulty is required on
// roadmap tasks, so this is just a safety net) — the neutral middle.
const DEFAULT_TASK_POINTS = TASK_POINTS_BY_DIFFICULTY.medium;

/** The standard points for a difficulty (case-insensitive). */
function pointsForDifficulty(difficulty) {
  const key = String(difficulty || '').toLowerCase();
  return TASK_POINTS_BY_DIFFICULTY[key] ?? DEFAULT_TASK_POINTS;
}

module.exports = { TASK_POINTS_BY_DIFFICULTY, DEFAULT_TASK_POINTS, pointsForDifficulty };
