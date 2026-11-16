/**
 * The order every list of programs, intakes and selection pools reads in:
 * what is running first, then what has not started, then what has completed,
 * then what is closed or archived.
 *
 * Lists arrived in whatever order the API returned (or sorted by name), so a
 * finished intake could sit above the one taking applications today. One rank
 * for every screen, so they cannot drift apart again.
 */
const RANK: Record<string, number> = {
  // live
  open: 0, published: 0, active: 0, running: 0, qualifying: 0, reviewing: 0, placing: 0,
  // not started yet
  planning: 1, draft: 1,
  // done
  completed: 2,
  // closed / gone
  closed: 3, archived: 4,
};

export const lifecycleRank = (status?: string | null): number => RANK[status ?? ''] ?? 1;

/** Comparator: `list.sort(byLifecycle((x) => x.status))`. Ties keep their order (stable sort). */
export function byLifecycle<T>(statusOf: (item: T) => string | null | undefined) {
  return (a: T, b: T) => lifecycleRank(statusOf(a)) - lifecycleRank(statusOf(b));
}
