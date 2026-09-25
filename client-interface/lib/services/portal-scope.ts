import { roleFromPathname, type NotificationRole } from '@/lib/utils/notification-audience';

/**
 * Which portal the user currently has open, sent with every request.
 *
 * A person can hold several roles at once — lead mentor of one clan, co-mentor
 * of another, learner in a third — and until now only the browser knew which
 * portal was open. The server answered every "my stuff" question with the union
 * of all of them, so the mentee Roadblocks page listed the user's MENTEES'
 * roadblocks and the mentee inbox listed the threads they hold as a mentor.
 *
 * The portal is read from the URL rather than from React state so that any
 * caller gets it — including the axios interceptors, which sit outside the
 * component tree. `/mentee/blockers` is unambiguous about which hat is on, and
 * it is the same rule the notification bell already uses to decide which
 * notifications belong to the current portal (`roleFromPathname`).
 *
 * These headers can only ever NARROW what comes back: the server re-derives the
 * user's real roles and a portal they do not hold resolves to nothing extra.
 */

/** Must match ClanContext storage keys. Mentor and mentee workspaces are independent. */
const MENTOR_CLAN_STORAGE_KEY = 'pathment-active-clan';
const MENTEE_CLAN_STORAGE_KEY = 'pathment-active-mentee-clan';
const ALL_CLANS = 'all';

export const PORTAL_ROLE_HEADER = 'X-Portal-Role';
export const ACTIVE_CLAN_HEADER = 'X-Active-Clan';

function currentPortalRole(): NotificationRole | null {
  if (typeof window === 'undefined') return null;
  return roleFromPathname(window.location.pathname);
}

function currentClanId(): string | null {
  if (typeof window === 'undefined') return null;
  const role = currentPortalRole();

  /**
   * The clan picker exists in the mentor and mentee portals. An admin screen
   * has no active clan, so sending one there is not a narrower question — it is
   * the user's OTHER hat bleeding into this one.
   *
   * It did exactly that. This read the mentor picker's clan for any portal that
   * was not 'mentee', admin included, so an admin who also mentors a clan
   * loaded the certificate round and got a verification queue narrowed to their
   * own ten mentees — while the approval banner, which sends no clan, still
   * described all 28. One screen, two answers: a clan shown as fully signed off
   * that opened to no decisions at all.
   */
  if (role === 'admin') return null;

  try {
    const key = role === 'mentee' ? MENTEE_CLAN_STORAGE_KEY : MENTOR_CLAN_STORAGE_KEY;
    const saved = window.localStorage.getItem(key);
    return saved && saved !== ALL_CLANS ? saved : null;
  } catch {
    // Private mode / blocked storage: no clan filter is a fine answer.
    return null;
  }
}

/** Headers describing the current portal. Empty on the server or a neutral page. */
export function portalScopeHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const role = currentPortalRole();
  if (role) headers[PORTAL_ROLE_HEADER] = role;
  const clanId = currentClanId();
  if (clanId) headers[ACTIVE_CLAN_HEADER] = clanId;
  return headers;
}
