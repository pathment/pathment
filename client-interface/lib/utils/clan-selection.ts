/**
 * Which clan a mentor or mentee is looking at, and why.
 *
 * Pure on purpose: this is the rule that decides what somebody sees the moment
 * they open Pathment, and it is worth being able to test it without mounting a
 * provider. `ClanContext` holds the state and the storage; everything about
 * *choosing* lives here.
 */

export const ALL_CLANS = 'all';

/** Only the fields the rule reads. Keeps this free of a React import. */
export interface SelectableClan {
  id: string;
  kind?: 'cohort' | 'standing';
  frozenAt?: string | null;
}

/**
 * Where a person's clan choice is stored.
 *
 * The choice belongs to an ACCOUNT, not to a browser. It used to live under a
 * single global key, which left signing in with only one safe move: delete it,
 * so the next person to use this browser did not inherit someone else's clan.
 * That delete is why the selection never survived coming back — every login,
 * sign-in link and 2FA completion threw it away.
 *
 * Keying by user id makes the choice durable *and* private to the account that
 * made it, so there is nothing to clear on the way in or out.
 */
export const LEGACY_MENTOR_CLAN_KEY = 'pathment-active-clan';
export const LEGACY_MENTEE_CLAN_KEY = 'pathment-active-mentee-clan';

/** Storage key for a mentor's clan choice. Null when nobody is signed in. */
export function mentorClanKey(userId: string | null | undefined): string | null {
  return userId ? `${LEGACY_MENTOR_CLAN_KEY}:${userId}` : null;
}

/** Storage key for a mentee's clan choice. Null when nobody is signed in. */
export function menteeClanKey(userId: string | null | undefined): string | null {
  return userId ? `${LEGACY_MENTEE_CLAN_KEY}:${userId}` : null;
}

/**
 * Where to land when nobody has chosen.
 *
 * A live clan beats a finished one. Nobody opens Pathment to look at a
 * programme that ended, and landing read-only on the first screen of the day
 * reads as the app being broken rather than as a deliberate scope. The lists
 * already arrive sorted active-first, so this is usually just the head — the
 * filter is for when it is not.
 */
export function defaultClanOf(clans: SelectableClan[]): string | null {
  if (!clans.length) return null;
  const live = clans.find((c) => c.kind === 'standing' || !c.frozenAt);
  return (live ?? clans[0]).id;
}

/**
 * The mentor's effective clan.
 *
 * `choice` is what they last picked: `null` before storage has been read, `''`
 * when they have never picked anything, otherwise a clan id. `'all'` may still
 * arrive from storage written before the merged view was retired.
 *
 * A mentor is always looking at ONE clan. "All clans" used to be both an
 * option and the default, so the app opened on a merged view that answers no
 * question in particular, and every screen underneath had to decide what it
 * meant. It is no longer offered, and a stored `'all'` is treated as "never
 * chose" — so an existing mentor is moved on to a real clan the next time they
 * load, instead of being stuck on a scope the picker can no longer show.
 *
 * ALL_CLANS survives as the answer to "this mentor has no clans at all", which
 * is the only case left where there is nothing better to return.
 */
export function resolveMentorClan(
  choice: string | null,
  clans: SelectableClan[],
  unsettled: boolean,
): string {
  if (choice === null) return ALL_CLANS;                 // storage not read yet
  if (choice && choice !== ALL_CLANS && clans.some((c) => c.id === choice)) return choice;
  // A stored 'all' is a choice we no longer honour, but it is not a reason to
  // overwrite it while the clan list is still unknown — that is how the saved
  // choice used to get clobbered on every sign-in.
  if (choice === ALL_CLANS && !unsettled) return defaultClanOf(clans) ?? ALL_CLANS;
  if (choice === ALL_CLANS) return ALL_CLANS;
  // An empty list is not evidence that their clan is gone — it is also what
  // "we have not been told yet" looks like, both while the request is in
  // flight and before it is even allowed to start. Falling back on either is
  // what made every visit flash "All clans", and what overwrote the saved
  // choice with "all" on the next sign-in.
  if (unsettled) return choice || ALL_CLANS;
  return defaultClanOf(clans) ?? ALL_CLANS;
}

/**
 * Which of the learner's clans a clan-scoped screen should show.
 *
 * "My clan" listed every clan they had ever been a mentee of, so somebody
 * whose cohort ended and carried on in a standing clan saw both stacked, each
 * with its own ask-to-move, and nothing said which one the rest of the
 * workspace was about. The sidebar already answers that.
 *
 * Falls back to the whole list on purpose: before the stored choice is read,
 * while a selection pool is the scope (`selected` is ''), or if the chosen
 * clan is not in the list, showing everything beats showing nothing on a page
 * called "My clan".
 */
export function visibleClansFor<T extends { id: string }>(clans: T[], selected: string): T[] {
  if (!selected) return clans;
  const picked = clans.filter((c) => c.id === selected);
  return picked.length ? picked : clans;
}

/**
 * A selection pool in the learner's scope picker.
 *
 * A pool is not a clan — there is no enrollment, no mentor, no roadmap — but
 * it is a place somebody belongs to and works in for weeks, and it sits in the
 * same picker for the same reason: it is the thing the whole workspace is
 * currently about. The id is prefixed so one stored string can hold either.
 */
export const POOL_SCOPE_PREFIX = 'pool:';

/** `pool:<id>` → `<id>`, or null when this is a clan. */
export function poolIdOf(scope: string | null | undefined): string | null {
  return scope && scope.startsWith(POOL_SCOPE_PREFIX) ? scope.slice(POOL_SCOPE_PREFIX.length) : null;
}

/** `<id>` → `pool:<id>`, the value the picker stores. */
export function poolScope(poolId: string): string {
  return `${POOL_SCOPE_PREFIX}${poolId}`;
}

/**
 * The learner's effective scope: a clan, or a selection pool.
 *
 * Same rule as the mentor's minus "all" — a learner is in one place at a time,
 * and a merged view would mean nothing to them. A clan wins the default
 * because somebody placed in a clan has graduated out of the round; a pool is
 * where the only people with no clan at all are.
 */
export function resolveMenteeClan(
  choice: string | null,
  clans: SelectableClan[],
  unsettled: boolean,
  poolIds: string[] = [],
): string {
  if (choice === null) return '';
  const chosenPool = poolIdOf(choice);
  if (chosenPool) {
    if (poolIds.includes(chosenPool)) return choice;
    if (unsettled) return choice;
  } else if (choice && clans.some((c) => c.id === choice)) {
    return choice;
  } else if (unsettled) {
    return choice;
  }
  return defaultClanOf(clans) ?? (poolIds.length ? poolScope(poolIds[0]) : '');
}
