import { NextRequest, NextResponse } from 'next/server';
import { validWorkspaceSlug, legacyWorkspaceFromHostname } from './lib/services/workspace-scope';

const WORKSPACE_COOKIE = 'pathment-workspace';
const ACCOUNT_ROUTES = new Set(['/', '/login', '/register', '/reset-password', '/verify-email', '/workspaces']);

function hostname(request: NextRequest) {
  return (request.headers.get('host') || '')
    .split(':')[0]
    .toLowerCase();
}

function isAsset(pathname: string) {
  return pathname.startsWith('/_next/') || pathname === '/favicon.ico' || pathname === '/robots.txt' || pathname === '/sitemap.xml';
}

/**
 * Public URL:  /w/acme/mentor/dashboard
 * Route tree:  /mentor/dashboard
 *
 * Rewriting keeps the mature route tree intact while making the workspace part
 * of every shareable URL. Legacy tenant hosts remain renderable during the
 * migration window so client JavaScript can securely transfer origin-scoped
 * sessions; LegacyDomainHandoff then moves the browser to the canonical URL.
 */
export function proxy(request: NextRequest) {
  const host = hostname(request);
  const pathname = request.nextUrl.pathname;
  if (isAsset(pathname) || pathname === '/api' || pathname.startsWith('/api/') || pathname.startsWith('/_link/')) return NextResponse.next();

  const legacy = legacyWorkspaceFromHostname(host);
  if (legacy) {
    const response = NextResponse.next();
    response.headers.set('X-Pathment-Legacy-Workspace', legacy);
    if (pathname === '/session-handoff') {
      response.headers.set('Cache-Control', 'no-store');
      response.headers.set('Referrer-Policy', 'no-referrer');
    }
    return response;
  }

  const match = pathname.match(/^\/w\/([^/]+)(\/.*)?$/);
  if (match) {
    const slug = match[1].toLowerCase();
    if (!validWorkspaceSlug(slug)) return new NextResponse('Workspace not found', { status: 404 });
    const rewritten = request.nextUrl.clone();
    rewritten.pathname = match[2] || '/';
    if (rewritten.pathname === '/api' || rewritten.pathname === '/_next' || rewritten.pathname === '/w' || rewritten.pathname.startsWith('/api/') || rewritten.pathname.startsWith('/_next/') || rewritten.pathname.startsWith('/w/')) return new NextResponse('Not found', { status: 404 });
    const response = NextResponse.rewrite(rewritten);
    if (rewritten.pathname === '/session-handoff') {
      response.headers.set('Cache-Control', 'no-store');
      response.headers.set('Referrer-Policy', 'no-referrer');
    }
    response.cookies.set(WORKSPACE_COOKIE, slug, {
      httpOnly: false,
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  }

  // Local development keeps the old short URLs available. Production app
  // traffic is canonicalized so old bookmarks and programmatic router pushes
  // cannot silently lose their workspace.
  const appHost = process.env.NEXT_PUBLIC_APP_HOST || 'app.pathment.me';
  if (host === appHost) {
    // Account-level entry points are deliberately workspace-neutral. The root
    // decides from the signed-in account's real memberships; it must never
    // infer a tenant from a stale cookie or the deployment's demo workspace.
    if (ACCOUNT_ROUTES.has(pathname)) return NextResponse.next();
    const remembered = request.cookies.get(WORKSPACE_COOKIE)?.value;
    const target = request.nextUrl.clone();
    // Old short links may reuse a workspace the browser actually visited. With
    // no valid remembered workspace, return to the chooser—never a hardcoded
    // tenant that the account may not belong to.
    target.pathname = validWorkspaceSlug(remembered) ? `/w/${remembered}${pathname}` : '/';
    target.search = '';
    return NextResponse.redirect(target, 307);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
