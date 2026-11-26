import { NextRequest, NextResponse } from 'next/server';
import { validWorkspaceSlug, legacyWorkspaceFromHostname } from './lib/services/workspace-scope';

const WORKSPACE_COOKIE = 'pathment-workspace';
const ACCOUNT_ROUTES = new Set(['/', '/login', '/register', '/reset-password', '/verify-email', '/workspaces']);

function hostname(request: NextRequest) {
  return (request.headers.get('host') || '')
    .split(':')[0]
    .toLowerCase();
}

// Files in /public (logo, mascot, badges, manifest). They have no workspace,
// and redirecting them to the account chooser broke the logo on the login page
// and every image linked from outside the app. Pages never end in these.
const PUBLIC_FILE = /\.(?:svg|png|jpe?g|webp|gif|ico|webmanifest|txt|xml|json|woff2?|pdf)$/i;

function isAsset(pathname: string) {
  return pathname.startsWith('/_next/') || pathname === '/favicon.ico' || pathname === '/robots.txt' || pathname === '/sitemap.xml'
    || PUBLIC_FILE.test(pathname);
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
  // `/.well-known/` is served as itself on every host. It is how Android and
  // iOS decide whether a link may open the app, and both fetch it without a
  // workspace cookie, so a rewrite or a redirect to the workspace chooser reads
  // as "this host trusts no app" and every email link opens the browser.
  if (isAsset(pathname) || pathname === '/api' || pathname.startsWith('/api/') || pathname.startsWith('/_link/') || pathname.startsWith('/.well-known/')) return NextResponse.next();

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
    // The platform console and owner activation are account-level too: they
    // span (or precede) workspaces, so canonicalizing them into /w/<slug>/…
    // would scope an operator surface to whatever tenant a cookie remembers.
    if (pathname === '/platform' || pathname.startsWith('/platform/') || pathname === '/activate') return NextResponse.next();
    const remembered = request.cookies.get(WORKSPACE_COOKIE)?.value;
    // Apply links are opened by strangers with no workspace cookie. Sending them
    // to the chooser ends at a login screen, a dead end for a public form. Let
    // the page render: the API finds the cohort's workspace from the link and
    // the page then moves itself onto /w/<workspace>/apply/….
    if (pathname.startsWith('/apply/') && !validWorkspaceSlug(remembered)) return NextResponse.next();
    const target = request.nextUrl.clone();
    // Old short links may reuse a workspace the browser actually visited. With
    // no valid remembered workspace, return to the chooser—never a hardcoded
    // tenant that the account may not belong to.
    const canonical = validWorkspaceSlug(remembered);
    target.pathname = canonical ? `/w/${remembered}${pathname}` : '/';
    /*
     * Canonicalizing the path must not throw the query away: it is part of the
     * address. Dropping it broke every deep link that carries state — a pool
     * candidate opening their own work lost the `?pool=1` that says to read it
     * from the candidate endpoint, landed on the clan route instead and was
     * told they had no access to their own task. The chooser is the exception:
     * it is a different destination, so the old query means nothing there.
     */
    if (!canonical) target.search = '';
    return NextResponse.redirect(target, 307);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
