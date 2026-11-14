export const RESERVED_WORKSPACES = new Set(['pathment', 'www', 'app', 'api', 'links', 'meet', 'staging', 'status', 'support', 'admin', 'mail', 'cdn', 'assets']);
export function validWorkspaceSlug(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value) && !value.startsWith('api-') && !RESERVED_WORKSPACES.has(value);
}

const KEY = 'pathment-active-workspace';
const PATH = /^\/w\/([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?=\/|$)/i;
const ACCOUNT_PATHS = new Set(['/', '/login', '/register', '/reset-password', '/verify-email', '/workspaces']);
let recoveringAccess = false;

export function workspaceSlugFromPathname(pathname: string): string | null {
  const slug = pathname.match(PATH)?.[1]?.toLowerCase();
  return validWorkspaceSlug(slug) ? slug : null;
}

export function logicalPathname(pathname: string): string {
  const match = pathname.match(PATH);
  if (!match) return pathname || '/';
  const rest = pathname.slice(match[0].length);
  return rest.startsWith('/') ? rest : (rest ? `/${rest}` : '/');
}

export function legacyWorkspaceFromHostname(host: string): string | null {
  if (!host.endsWith('.pathment.me')) return null;
  const slug = host.slice(0, -'.pathment.me'.length);
  return validWorkspaceSlug(slug) ? slug : null;
}

export function activeWorkspaceSlug(): string | null {
  if (typeof window === 'undefined') return null;
  // An explicitly invalid workspace must never fall back to a remembered tenant.
  if (window.location.pathname.startsWith('/w/')) return workspaceSlugFromPathname(window.location.pathname);
  const legacy = legacyWorkspaceFromHostname(window.location.hostname.toLowerCase());
  if (legacy) return legacy;
  // Account entry pages are deliberately tenant-neutral. A stale workspace
  // cookie is useful as a *recent choice*, but it must never scope API calls
  // made by the chooser/login bootstrap or it can bounce a removed member back
  // into the revoked workspace forever.
  if (ACCOUNT_PATHS.has(window.location.pathname)) return null;
  return rememberedWorkspaceSlug();
}

/** Last workspace visited, for ranking the account chooser only. */
export function rememberedWorkspaceSlug(): string | null {
  if (typeof window === 'undefined') return null;
  // Match the workspace selected by the routing proxy. Old unscoped links can
  // otherwise resurrect a stale localStorage choice after an explicit visit.
  if (typeof document !== 'undefined') {
    const selected = document.cookie.split(';').map(value => value.trim())
      .find(value => value.startsWith('pathment-workspace='))?.slice('pathment-workspace='.length);
    if (validWorkspaceSlug(selected)) return selected;
  }
  try {
    const remembered = localStorage.getItem(KEY);
    return validWorkspaceSlug(remembered) ? remembered : null;
  } catch { return null; }
}

export function workspacePath(path: string, slug = activeWorkspaceSlug()): string {
  if (!path || !validWorkspaceSlug(slug) || /^(?:[a-z]+:|#|\/\/)/i.test(path) || PATH.test(path)) return path;
  return `/w/${slug}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * An absolute link to hand to someone outside the app (an apply form, a join
 * link). It must carry the workspace in its path: the person opening it has no
 * workspace cookie, and an unscoped link sends them to the account chooser and
 * then to log in, which is a dead end for a public form. Legacy tenant hosts
 * already imply the workspace, so the path stays as it is there.
 */
export function shareableUrl(path: string): string {
  if (typeof window === 'undefined') return workspacePath(path);
  const legacy = legacyWorkspaceFromHostname(window.location.hostname.toLowerCase());
  return `${window.location.origin}${legacy ? path : workspacePath(path)}`;
}

type PortalRole = 'admin' | 'mentor' | 'mentee';
type WorkspaceUser = {
  role: PortalRole;
  capabilities?: Array<PortalRole | 'candidate'>;
};

const PORTALS: PortalRole[] = ['admin', 'mentor', 'mentee'];
const isPortal = (value: unknown): value is PortalRole => PORTALS.includes(value as PortalRole);

/**
 * Resolve the first authenticated screen without bouncing through `/`.
 *
 * A selection-pool candidate has no portal of their own: they land in the
 * learner workspace, where their round appears in the scope picker beside any
 * clans they are in. That used to be a separate `/candidate` area, which split
 * one person's work across two shells.
 */
export function workspaceLandingPath(user: WorkspaceUser): string {
  const capabilities = user.capabilities ?? [user.role];
  let stored: PortalRole | null = null;
  try {
    const value = localStorage.getItem('activeRole');
    if (isPortal(value)) stored = value;
  } catch { /* The user's account role remains a safe fallback. */ }
  const portals = capabilities.filter(isPortal);
  const role = stored && portals.includes(stored)
    ? stored
    : isPortal(user.role) && portals.includes(user.role)
      ? user.role
      : portals[0];
  if (role) return workspacePath(`/${role}/dashboard`);
  // Only a pool candidate reaches this: the learner workspace in pool scope.
  if (capabilities.includes('candidate')) return workspacePath('/mentee/dashboard');
  return workspacePath('/workspaces');
}

export function workspaceScopeHeaders(): Record<string, string> {
  const slug = activeWorkspaceSlug();
  return slug ? { 'X-Pathment-Workspace': slug } : {};
}

/**
 * A workspace membership can be suspended or removed while a tab is open.
 * Keep the global account session, discard only the stale workspace choice,
 * and let `/` resolve the remaining memberships. This prevents an old URL or
 * cookie from repeatedly reopening a workspace the account can no longer use.
 */
export function recoverFromWorkspaceAccessDenied(code: unknown, requestWorkspace: unknown): boolean {
  if (code !== 'WORKSPACE_ACCESS_DENIED' || typeof window === 'undefined') return false;
  const active = activeWorkspaceSlug();
  // A denial only proves that the workspace explicitly attached to THIS
  // request is no longer accessible. Never let an unscoped/global request (or
  // a late response from a previous workspace) evict the current selection.
  if (!active || typeof requestWorkspace !== 'string' || requestWorkspace.toLowerCase() !== active) return false;
  try { localStorage.removeItem(KEY); } catch { /* URL redirect is sufficient */ }
  if (typeof document !== 'undefined') {
    document.cookie = 'pathment-workspace=; Max-Age=0; Path=/; SameSite=Lax';
    document.cookie = 'pathment-workspace=; Max-Age=0; Path=/; SameSite=Lax; Secure';
  }
  if (!recoveringAccess) {
    recoveringAccess = true;
    window.location.replace('/');
  }
  return true;
}

export function switchWorkspace(slug: string): void {
  if (typeof window === 'undefined') return;
  if (!validWorkspaceSlug(slug)) throw new Error('Invalid workspace');
  try { localStorage.setItem(KEY, slug); } catch { /* URL remains authoritative. */ }
  const host = window.location.hostname.toLowerCase();
  const local = host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host);
  const origin = local ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL || 'https://app.pathment.me');
  const path = logicalPathname(window.location.pathname);
  // Record ids and role areas from the previous workspace need not exist here.
  // `/w/:slug` renders the account entry page. Sending a signed-in user there
  // caused it to bounce back to the workspace chooser. The scoped login route
  // already resolves a valid session to the correct active-role dashboard.
  const destination = path === '/workspace-preview' ? path : '/login';
  window.location.assign(`${origin}/w/${slug}${destination}`);
}
