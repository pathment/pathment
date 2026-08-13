/**
 * Central auth-token store.
 *
 * "Remember me" decides WHERE the session lives:
 *   - remembered  → localStorage   (survives a browser restart, up to the
 *                                    30-day refresh-token lifetime)
 *   - not remembered → sessionStorage (cleared when the browser/tab is closed)
 *
 * Every part of the app must read/write tokens through here — never touch
 * localStorage/sessionStorage for these keys directly — so the two stores can
 * never disagree about who is logged in.
 */

const SESSION_KEYS = ['token', 'refreshToken', 'user'] as const;
const MODE_KEY = 'rememberMode'; // 'local' | 'session'

const isBrowser = () => typeof window !== 'undefined';

/** The store that currently holds a session, if any (localStorage wins). */
function activeStore(): Storage | null {
  if (!isBrowser()) return null;
  if (localStorage.getItem('token') !== null) return localStorage;
  if (sessionStorage.getItem('token') !== null) return sessionStorage;
  return null;
}

/** Read a session value from wherever it lives (persistent store preferred). */
function read(key: string): string | null {
  if (!isBrowser()) return null;
  return localStorage.getItem(key) ?? sessionStorage.getItem(key);
}

export const getToken = () => read('token');
export const getRefreshToken = () => read('refreshToken');

export function getUser<T = unknown>(): T | null {
  const raw = read('user');
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

/**
 * Persist a fresh login. `remember` picks the store; the other store is wiped so
 * a stale token there can never resurrect a logged-out session.
 */
export function setSession(
  { token, refreshToken, user }: { token: string; refreshToken: string; user?: unknown },
  remember: boolean,
): void {
  if (!isBrowser()) return;
  const primary = remember ? localStorage : sessionStorage;
  const other = remember ? sessionStorage : localStorage;
  SESSION_KEYS.forEach((k) => other.removeItem(k));
  other.removeItem(MODE_KEY);
  primary.setItem('token', token);
  primary.setItem('refreshToken', refreshToken);
  if (user !== undefined) primary.setItem('user', JSON.stringify(user));
  primary.setItem(MODE_KEY, remember ? 'local' : 'session');
}

/** Replace just the access token (silent refresh) in the active store. */
export function setToken(token: string): void {
  if (!isBrowser()) return;
  const store = activeStore()
    ?? (localStorage.getItem(MODE_KEY) === 'session' ? sessionStorage : localStorage);
  store.setItem('token', token);
}

/**
 * Replace the refresh token after the server rotates it.
 *
 * Refresh tokens are single-use: /auth/refresh spends the one we sent and
 * returns its successor. Failing to persist it here would leave us replaying a
 * spent token, which the server reads as a stolen-token replay and answers by
 * ending every session — so this write is what keeps people signed in.
 */
export function setRefreshToken(refreshToken: string): void {
  if (!isBrowser()) return;
  const store = activeStore()
    ?? (localStorage.getItem(MODE_KEY) === 'session' ? sessionStorage : localStorage);
  store.setItem('refreshToken', refreshToken);
}

/** Update the cached user object in the active store. */
export function setUser(user: unknown): void {
  if (!isBrowser()) return;
  const store = activeStore()
    ?? (localStorage.getItem(MODE_KEY) === 'session' ? sessionStorage : localStorage);
  store.setItem('user', JSON.stringify(user));
}

/** Remove the session from BOTH stores. */
export function clearSession(): void {
  if (!isBrowser()) return;
  [localStorage, sessionStorage].forEach((store) => {
    SESSION_KEYS.forEach((k) => store.removeItem(k));
    store.removeItem(MODE_KEY);
  });
}

export const tokenStore = {
  getToken, getRefreshToken, getUser, setSession, setToken, setRefreshToken, setUser, clearSession,
};
