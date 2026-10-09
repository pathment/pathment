import axios from 'axios';
import { toast } from 'sonner';
import { logicalPathname, workspacePath } from './workspace-scope';
import { apiConfig } from '../config/api';
import { tokenStore } from './token-store';
import { getRateLimit } from '../utils/api-error';

/**
 * auth-session — the ONE place that renews the access token.
 *
 * Why this exists: the access token lives ~15 minutes, so any long-lived screen
 * (a cohort review call, a page left open) *will* hit an expiry mid-use. The old
 * behaviour treated ANY failed `/auth/refresh` as "your session is over" and
 * bounced the user to /login?expired=true. That is wrong for the most common
 * failure by far — a transient one. A Wi-Fi blip during a video call, a Heroku
 * dyno restart (502/503), a request timeout or a 429 all made the refresh call
 * fail, and the user got logged out mid-meeting even though their refresh token
 * was perfectly valid.
 *
 * So refresh failures are now CLASSIFIED:
 *   - the server explicitly rejected the refresh token (401/403/4xx) → the
 *     session really is dead → clear + redirect to login (once).
 *   - anything else (offline, timeout, 5xx, 429) → the session is FINE, we just
 *     couldn't reach the server. Keep the tokens, back off, retry automatically.
 *     The failing request simply fails; the next poll picks up where it left off.
 *
 * On top of that the token is renewed PROACTIVELY (shortly before it expires,
 * and whenever the tab wakes up or the network comes back), so the renewal
 * almost never has to happen at the worst possible moment.
 */

/** Renew this long before the token actually expires. */
const REFRESH_SKEW_MS = 90_000;
/** Backoff after transient failures, so a flaky network isn't hammered. */
const BACKOFF_MS = [2_000, 5_000, 10_000, 20_000, 30_000, 60_000];

/** The refresh token was rejected — the user has to log in again. */
export class SessionExpiredError extends Error {
  constructor() {
    super('Your session has expired. Please log in again.');
    this.name = 'SessionExpiredError';
  }
}

/** We could not reach the server. The session is still valid — retry later. */
export class RefreshUnavailableError extends Error {
  constructor(message = 'Could not reach the server to renew your session.') {
    super(message);
    this.name = 'RefreshUnavailableError';
  }
}

// ── token introspection ──────────────────────────────────────────────────────

/** `exp` of a JWT in ms, or null when it can't be read (then we never schedule). */
function decodeExpiryMs(token: string | null): number | null {
  if (!token) return null;
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = JSON.parse(json)?.exp;
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/** True when we hold a token that is expired or about to be. */
function needsRefresh(): boolean {
  const current = tokenStore.getToken();
  // A persisted refresh credential without an access token is still a session
  // we can restore. Treat it as immediately due instead of silently leaving the
  // account signed out until the visitor enters a workspace again.
  if (!current) return Boolean(tokenStore.getRefreshToken());
  const exp = decodeExpiryMs(current);
  if (exp === null) return false;
  return Date.now() >= exp - REFRESH_SKEW_MS;
}

/**
 * Return a usable account access token, restoring the persisted session when
 * the short-lived access token is missing. Refresh is single-flight, so the
 * root gateway and AuthProvider can safely arrive here at the same time.
 */
export async function restoreAccessToken(): Promise<string | null> {
  const current = tokenStore.getToken();
  if (current) return current;
  if (!tokenStore.getRefreshToken()) return null;
  return refreshAccessToken();
}

/**
 * A failure we should NOT log the user out for: no response at all (offline,
 * DNS, CORS, aborted), a timeout, a rate limit, or a server-side error.
 */
function isTransient(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === undefined) return true; // network error / timeout / cancelled
  if (status === 408 || status === 429) return true;
  return status >= 500;
}

// ── single-flight refresh ────────────────────────────────────────────────────

let refreshPromise: Promise<string> | null = null;
let consecutiveFailures = 0;
let blockedUntil = 0;
// A 429 is the server explicitly telling us to wait. Unlike a flaky network, it
// is not resolved by trying again sooner — so `wake()` must not clear the window.
let blockedByRateLimit = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let proactiveTimer: ReturnType<typeof setTimeout> | null = null;
let expiredHandled = false;

const listeners = new Set<(token: string) => void>();

/** Notified whenever a NEW access token lands (the socket re-auths on this). */
export function onAccessTokenRefreshed(fn: (token: string) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/**
 * Renew the access token. At most ONE request is in flight: a page that fires a
 * dozen requests at the moment of expiry produces a single `/auth/refresh`, and
 * every waiter reuses its result.
 *
 * Rejects with `SessionExpiredError` (log out) or `RefreshUnavailableError`
 * (keep the session, try again later) — callers must distinguish the two.
 */
export function refreshAccessToken(): Promise<string> {
  if (refreshPromise) return refreshPromise;

  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) return Promise.reject(new SessionExpiredError());
  // Still inside a backoff window from a previous transient failure — fail fast
  // instead of piling more requests onto a network that just proved unreliable.
  if (Date.now() < blockedUntil) return Promise.reject(new RefreshUnavailableError());

  refreshPromise = axios
    .post(
      `${apiConfig.baseUrl}${apiConfig.endpoints.refreshToken}`,
      { refreshToken },
      { headers: { 'Content-Type': 'application/json' }, timeout: 20_000 }
    )
    .then((response) => {
      const token = response.data?.data?.accessToken || response.data?.accessToken
        || response.data?.data?.token || response.data?.token;
      if (!token) throw new SessionExpiredError();
      consecutiveFailures = 0;
      blockedUntil = 0;
      blockedByRateLimit = false;
      // The server ROTATES refresh tokens: the one we just sent is spent, and
      // the response carries its successor. Persist it before the access token,
      // because replaying a spent token is read as theft and ends every session.
      // Older servers omit the field — then the token we hold is still valid.
      const rotated = response.data?.data?.refreshToken || response.data?.refreshToken;
      if (rotated) tokenStore.setRefreshToken(rotated);
      tokenStore.setToken(token);
      scheduleProactiveRefresh();
      listeners.forEach((fn) => { try { fn(token); } catch { /* a listener must not break refresh */ } });
      return token as string;
    })
    .catch((error) => {
      if (error instanceof SessionExpiredError) throw error;
      if (!isTransient(error)) throw new SessionExpiredError();
      // Transient: hold the session, back off, and self-heal in the background.
      const { limited, retryAfterSec } = getRateLimit(error);
      blockedByRateLimit = limited;
      // Honour the server's own retry-after rather than our generic curve.
      const wait = limited
        ? Math.max(retryAfterSec * 1000, BACKOFF_MS[0])
        : BACKOFF_MS[Math.min(consecutiveFailures, BACKOFF_MS.length - 1)];
      consecutiveFailures += 1;
      blockedUntil = Date.now() + wait;
      scheduleRetry(wait);
      throw new RefreshUnavailableError();
    })
    .finally(() => { refreshPromise = null; });

  return refreshPromise;
}

/** After a transient failure, quietly try again — the user shouldn't have to act. */
function scheduleRetry(waitMs: number): void {
  if (typeof window === 'undefined') return;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (!tokenStore.getRefreshToken() || !needsRefresh()) return;
    refreshAccessToken().catch(() => { /* the next retry / request handles it */ });
  }, waitMs + 250);
}

/**
 * Renew shortly BEFORE expiry, so the token is fresh when a request needs it
 * rather than being renewed in the middle of whatever the user is doing.
 */
function scheduleProactiveRefresh(): void {
  if (typeof window === 'undefined') return;
  if (proactiveTimer) clearTimeout(proactiveTimer);
  const exp = decodeExpiryMs(tokenStore.getToken());
  if (exp === null) return;
  const delay = Math.min(Math.max(5_000, exp - Date.now() - REFRESH_SKEW_MS), 2_147_000_000);
  proactiveTimer = setTimeout(() => {
    proactiveTimer = null;
    // A background renewal never logs anyone out — if the refresh token really is
    // dead, the next real request surfaces it with the right context.
    refreshAccessToken().catch(() => { /* handled by the request path */ });
  }, delay);
}

/**
 * Start the background renewal loop. Called once from AuthProvider.
 * Also renews when the tab is brought back to the foreground or the network
 * returns — the two moments when a timer has most likely been throttled/missed.
 */
export function startAuthSession(): () => void {
  if (typeof window === 'undefined') return () => {};
  expiredHandled = false;
  scheduleProactiveRefresh();

  const wake = () => {
    if (!tokenStore.getRefreshToken()) return;
    // A fresh network or fresh attention deserves an immediate try — but NOT when
    // the server rate-limited us. Clearing the window unconditionally meant every
    // tab focus and every `online` event fired another /auth/refresh straight into
    // the limit that had just rejected us, across every open tab.
    if (blockedByRateLimit && Date.now() < blockedUntil) {
      scheduleRetry(blockedUntil - Date.now());
      return;
    }
    blockedUntil = 0;
    if (needsRefresh()) refreshAccessToken().catch(() => { /* request path handles it */ });
    else scheduleProactiveRefresh();
  };
  const onVisible = () => { if (document.visibilityState === 'visible') wake(); };

  window.addEventListener('online', wake);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    window.removeEventListener('online', wake);
    document.removeEventListener('visibilitychange', onVisible);
    if (proactiveTimer) clearTimeout(proactiveTimer);
    if (retryTimer) clearTimeout(retryTimer);
    proactiveTimer = null;
    retryTimer = null;
  };
}

/**
 * The session is genuinely over: clear it and send the user to login ONCE
 * (a single expiry can 401 a dozen in-flight requests). The page they were on
 * is carried in `next` so re-logging in puts them straight back — a mentor
 * bounced mid-review lands back on the review, not on a dashboard.
 */
export function handleSessionExpired(message = 'Your session has expired. Please log in again.'): void {
  if (expiredHandled) return;
  expiredHandled = true;
  tokenStore.clearSession();
  if (typeof window === 'undefined') return;
  try { toast.error(message); } catch { /* toasts are optional */ }

  const here = `${window.location.pathname}${window.location.search}`;
  const logical = logicalPathname(window.location.pathname);
  const returnable = here && logical !== '/' && !logical.startsWith('/login') && !logical.startsWith('/register');
  const next = returnable ? `&next=${encodeURIComponent(here)}` : '';
  setTimeout(() => { window.location.href = workspacePath(`/login?expired=true${next}`); }, 1200);
}

/** Reset after a fresh login so a previous expiry can't suppress a later one. */
export function resetAuthSession(): void {
  expiredHandled = false;
  consecutiveFailures = 0;
  blockedUntil = 0;
  blockedByRateLimit = false;
  scheduleProactiveRefresh();
}
