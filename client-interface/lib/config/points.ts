// Standard task points by difficulty — mirrors server/src/config/points.js.
// A task's points are determined entirely by its difficulty (no hand-typed
// values), so the same difficulty always earns the same points. The server is
// authoritative; this is for display.
export const TASK_POINTS_BY_DIFFICULTY: Record<string, number> = {
  easy: 5,
  medium: 10,
  hard: 20,
  expert: 40,
};

const DEFAULT_TASK_POINTS = TASK_POINTS_BY_DIFFICULTY.medium;

/** Standard points for a difficulty (case-insensitive). */
export function pointsForDifficulty(difficulty?: string | null): number {
  return TASK_POINTS_BY_DIFFICULTY[String(difficulty || '').toLowerCase()] ?? DEFAULT_TASK_POINTS;
}
