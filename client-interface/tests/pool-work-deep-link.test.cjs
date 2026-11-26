const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

/**
 * A candidate opening their own qualifying work.
 *
 * Pool work is fenced out of every clan task query, so its page is told where
 * to read it from by `?pool=1`. Two things used to lose that flag and land the
 * person on "You do not have access to this task" — about work the round had
 * just given them:
 *
 *   1. the links were unscoped `/mentee/...` paths, so following one left the
 *      workspace and came back through a redirect, and
 *   2. that redirect threw the query string away.
 *
 * A pool candidate is deliberately not a mentee (no mentee capability until
 * they are placed), so the clan route refuses them with 403 rather than 404 —
 * which is why the page's fallback has to read both.
 */

function load(file, deps = {}) {
  const exports = {};
  const code = ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '..', file), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } },
  ).outputText;
  vm.runInNewContext(code, {
    exports, module: { exports },
    console,
    // proxy.ts reads env (the app host, the default workspace); give it the
    // real one so the test exercises the same branch production does.
    process: { env: process.env },
    URL, URLSearchParams,
    require: (id) => {
      if (deps[id]) return deps[id];
      throw new Error(`Unexpected dependency ${id}`);
    },
  });
  return exports;
}

// ── the redirect keeps the query ────────────────────────────────────────────
function runProxy({ host, pathname, search, cookie }) {
  let redirected = null;
  const nextServer = {
    NextResponse: {
      next: () => ({ kind: 'next' }),
      redirect: (url, status) => { redirected = { url, status }; return { kind: 'redirect', url, status }; },
      rewrite: (url) => ({ kind: 'rewrite', url }),
    },
  };
  const scope = load('lib/services/workspace-scope.ts', {});
  const { proxy } = load('proxy.ts', { 'next/server': nextServer, './lib/services/workspace-scope': scope });

  const url = new URL(`https://${host}${pathname}${search}`);
  const request = {
    nextUrl: { clone: () => new URL(url.toString()), pathname, search },
    headers: { get: (k) => (k.toLowerCase() === 'host' ? host : null) },
    cookies: { get: (name) => (cookie && name === 'pathment-workspace' ? { value: cookie } : undefined) },
    url: url.toString(),
  };
  const result = proxy(request);
  return { result, redirected };
}

test('canonicalizing an unscoped deep link keeps its query string', () => {
  const { redirected } = runProxy({
    host: 'app.pathment.me',
    pathname: '/mentee/tasks/abc-123',
    search: '?pool=1',
    cookie: 'devweekends',
  });
  assert.ok(redirected, 'expected a redirect into the workspace');
  assert.equal(redirected.url.pathname, '/w/devweekends/mentee/tasks/abc-123');
  assert.equal(redirected.url.search, '?pool=1', 'the flag that says where to read this work from must survive');
});

test('with no workspace to canonicalize into, the chooser gets no stale query', () => {
  const { redirected } = runProxy({
    host: 'app.pathment.me',
    pathname: '/mentee/tasks/abc-123',
    search: '?pool=1',
    cookie: null,
  });
  assert.ok(redirected);
  assert.equal(redirected.url.pathname, '/');
  assert.equal(redirected.url.search, '');
});

// ── the links do not leave the workspace in the first place ─────────────────
test('a pool work link is workspace-scoped and carries the flag', () => {
  const scope = load('lib/services/workspace-scope.ts', {});
  const href = scope.workspacePath('/mentee/tasks/abc-123?pool=1', 'devweekends');
  assert.equal(href, '/w/devweekends/mentee/tasks/abc-123?pool=1');
  // Already scoped: scoping again must not double the prefix.
  assert.equal(scope.workspacePath(href, 'devweekends'), href);
});

// ── the page falls back on both refusals ────────────────────────────────────
test('the task page tries the candidate endpoint on 403 as well as 404', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app/mentee/tasks/[id]/page.tsx'), 'utf8');
  const match = source.match(/errorStatus === 404[\s\S]{0,120}?PoolFallback/);
  assert.ok(match, 'expected the 404 fallback to still be there');
  assert.match(match[0], /errorStatus === 403|403 === errorStatus/,
    'a pool candidate is refused with 403, so the fallback must read it too');
});
