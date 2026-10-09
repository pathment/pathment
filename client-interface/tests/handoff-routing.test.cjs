const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');

function load(file, mocks = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, require: id => { if (!(id in mocks)) throw new Error(`Unexpected dependency ${id}`); return mocks[id]; }, process: { env: {} }, URL, URLSearchParams, TextEncoder, Uint8Array, btoa, crypto: webcrypto, ...globals });
  return exports;
}
function storage() {
  const data = new Map();
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) };
}
function browser(url) {
  const location = new URL(url);
  location.replace = value => { location.destination = value; };
  location.assign = value => { location.destination = value; };
  return { location, history: { replaceState: () => {} } };
}
function fixture(url, post = async () => { throw new Error('Unexpected request'); }, options = {}) {
  const window = browser(url);
  const localStorage = storage();
  const sessionStorage = storage();
  const globals = { window, localStorage, sessionStorage };
  const scope = load('lib/services/workspace-scope.ts', {}, globals);
  const sessions = [];
  const handoff = load('lib/services/domain-handoff.ts', {
    axios: { default: { post } }, '../config/api': { apiConfig: { baseUrl: 'https://api.pathment.me/api', timeout: 100 } },
    './token-store': { tokenStore: { getToken: () => options.token === null ? null : 'existing', getUser: () => ({ id: options.userId || 'user' }), isRememberedSession: () => true, setSession: (...args) => sessions.push(args) } },
    './workspace-scope': scope,
    './auth-session': { refreshAccessToken: options.refresh || (async () => { throw new Error('Unexpected refresh'); }) },
  }, globals);
  return { window, localStorage, sessionStorage, scope, handoff, sessions };
}

test('workspace selection rejects reserved hosts, invalid storage, and invalid explicit paths', () => {
  const f = fixture('https://app.pathment.me/login');
  assert.equal(f.scope.activeWorkspaceSlug(), null);
  f.localStorage.setItem('pathment-active-workspace', '../evil');
  assert.equal(f.scope.activeWorkspaceSlug(), null);
  f.localStorage.setItem('pathment-active-workspace', 'acme');
  assert.equal(f.scope.activeWorkspaceSlug(), 'acme');
  f.window.location.pathname = '/w/app/login';
  assert.equal(f.scope.activeWorkspaceSlug(), null);
  assert.throws(() => f.scope.switchWorkspace('../evil'));
  f.window.location.pathname = '/w/other/mentor/dashboard';
  assert.equal(f.scope.activeWorkspaceSlug(), 'other');
  f.scope.switchWorkspace('acme');
  assert.equal(f.window.location.destination, 'https://app.pathment.me/w/acme/login');
});

test('redirects stay inside the selected workspace', () => {
  const { handoff, scope } = fixture('https://app.pathment.me/w/acme/session-handoff');
  for (const value of ['//evil.test', '/\\evil.test', '/w/other//evil.test', '/session-handoff', '/login', '/\nevil']) {
    assert.equal(handoff.safeHandoffDestination(value), '/mentee/dashboard');
  }
  assert.equal(scope.workspacePath(handoff.safeHandoffDestination('/w/other/mentor/dashboard?q=1#x'), 'acme'), '/w/acme/mentor/dashboard?q=1#x');
});

test('login resolves directly to the selected role dashboard', () => {
  const f = fixture('https://app.pathment.me/w/acme/login');
  const user = { role: 'mentee', capabilities: ['mentee', 'mentor'] };
  assert.equal(f.scope.workspaceLandingPath(user), '/w/acme/mentee/dashboard');
  f.localStorage.setItem('activeRole', 'mentor');
  assert.equal(f.scope.workspaceLandingPath(user), '/w/acme/mentor/dashboard');
  f.localStorage.setItem('activeRole', 'admin');
  assert.equal(f.scope.workspaceLandingPath(user), '/w/acme/mentee/dashboard');
  assert.equal(f.scope.workspaceLandingPath({ role: 'mentee', capabilities: [] }), '/w/acme/workspaces');
});

test('proxy workspace cookie takes precedence over stale storage on short links', () => {
  const localStorage = storage();
  localStorage.setItem('pathment-active-workspace', 'deleted-workspace');
  const window = browser('http://localhost:3000/mentor/dashboard');
  const scope = load('lib/services/workspace-scope.ts', {}, {
    window, localStorage, document: { cookie: 'pathment-workspace=devweekends' },
  });
  assert.equal(scope.activeWorkspaceSlug(), 'devweekends');
  window.location.pathname = '/w/explicit/login';
  assert.equal(scope.activeWorkspaceSlug(), 'explicit');
});

test('destination creates a tab-bound verifier and only sends its challenge to legacy', async () => {
  const f = fixture('https://app.pathment.me/w/acme/session-handoff#start=1&next=%2Fmentor%2Fdashboard');
  const a = f.handoff.runDomainHandoff();
  assert.equal(a, f.handoff.runDomainHandoff());
  await a;
  const pending = JSON.parse(f.sessionStorage.getItem('pathment-handoff-v1'));
  const target = new URL(f.window.location.destination);
  const params = new URLSearchParams(target.hash.slice(1));
  assert.equal(target.origin, 'https://acme.pathment.me');
  assert.equal(params.get('state'), pending.state);
  assert.notEqual(params.get('challenge'), pending.verifier);
  assert.equal(params.get('challenge'), require('crypto').createHash('sha256').update(pending.verifier).digest('base64url'));
  assert.ok(!target.href.includes(pending.verifier));
});

test('unbound and mismatched callbacks cannot overwrite a session or call API', async () => {
  for (const pending of [null, { state: 'different', workspace: 'acme', expires: Date.now()+1000, verifier: 'a'.repeat(43) }, { state: 's', workspace: 'other', expires: Date.now()+1000, verifier: 'a'.repeat(43) }, { state: 's', workspace: 'acme', expires: 1, verifier: 'a'.repeat(43) }]) {
    const f = fixture('https://app.pathment.me/w/acme/session-handoff#code=attacker&state=s');
    f.sessionStorage.setItem('pathment-handoff-v1', JSON.stringify(pending));
    await assert.rejects(f.handoff.runDomainHandoff());
    assert.equal(f.sessions.length, 0);
  }
});

test('duplicate redemption shares a request, saves once, and scopes next', async () => {
  let requests = 0;
  const f = fixture('https://app.pathment.me/w/acme/session-handoff#code=code&state=s', async (_url, body, config) => {
    requests++;
    assert.equal(body.codeVerifier, 'a'.repeat(43));
    assert.equal(config.headers.Authorization, undefined);
    return { data: { data: { user: { id: 'user', role: 'mentor' }, tokens: { accessToken: 'new', refreshToken: 'refresh' }, rememberSession: true } } };
  });
  f.sessionStorage.setItem('pathment-handoff-v1', JSON.stringify({ verifier: 'a'.repeat(43), state: 's', workspace: 'acme', next: '/w/other/mentor/dashboard', expires: Date.now()+10000 }));
  await Promise.all([f.handoff.runDomainHandoff(), f.handoff.runDomainHandoff()]);
  assert.equal(requests, 1);
  assert.equal(f.sessions.length, 1);
  assert.equal(f.window.location.destination, '/w/acme/mentor/dashboard');
});

test('transfer rejection preserves existing sessions without retries', async () => {
  let requests = 0;
  const f = fixture('https://app.pathment.me/w/acme/session-handoff#code=code&state=s', async () => { requests++; throw new Error('401'); });
  f.sessionStorage.setItem('pathment-handoff-v1', JSON.stringify({ verifier: 'a'.repeat(43), state: 's', workspace: 'acme', expires: Date.now()+10000 }));
  await assert.rejects(f.handoff.runDomainHandoff());
  await assert.rejects(f.handoff.runDomainHandoff());
  assert.equal(requests, 1);
  assert.equal(f.sessions.length, 0);
  assert.ok(f.sessionStorage.getItem('pathment-handoff-v1'));
});

test('proxy validates cookie fallback, ignores forwarded host, and rewrites scoped dotted paths', () => {
  const scope = load('lib/services/workspace-scope.ts');
  class Response {
    constructor(body, options) { this.body = body; this.status = options?.status; this.headers = new Map(); this.cookies = { set() {} }; }
    static next() { return { kind: 'next', headers: new Map() }; }
    static rewrite(url) { return Object.assign(new Response(), { kind: 'rewrite', url }); }
    static redirect(url) { return { kind: 'redirect', url }; }
  }
  const { proxy } = load('proxy.ts', { 'next/server': { NextResponse: Response }, './lib/services/workspace-scope': scope });
  function request(pathname, cookie = 'app') {
    const url = new URL(`https://app.pathment.me${pathname}`); url.clone = () => new URL(url);
    return { nextUrl: url, headers: new Map([['host', 'app.pathment.me'], ['x-forwarded-host', 'evil.pathment.me']]), cookies: { get: () => ({ value: cookie }) } };
  }
  assert.equal(proxy(request('/')).kind, 'next');
  assert.equal(proxy(request('/workspaces', 'devweekends')).kind, 'next');
  assert.equal(proxy(request('/login')).kind, 'next');
  assert.equal(proxy(request('/login', 'acme')).kind, 'next');
  assert.equal(proxy(request('/register', 'acme')).kind, 'next');
  assert.equal(proxy(request('/reset-password', 'acme')).kind, 'next');
  assert.equal(proxy(request('/api/health')).kind, 'next');
  assert.equal(proxy(request('/w/acme/report.csv')).url.pathname, '/report.csv');
  assert.equal(proxy(request('/w/app/login')).status, 404);
  assert.equal(proxy(request('/w/acme/api/private')).status, 404);
  assert.equal(proxy(request('/w/acme/session-handoff')).headers.get('Referrer-Policy'), 'no-referrer');
});

test('legacy issuer sends challenge once and never places access credentials in redirects', async () => {
  let requests = 0;
  const f = fixture(`https://acme.pathment.me/session-handoff#challenge=${'c'.repeat(43)}&state=${'s'.repeat(43)}`, async (_url, body, config) => {
    requests++;
    assert.equal(body.codeChallenge, 'c'.repeat(43));
    assert.equal(config.headers.Authorization, 'Bearer existing');
    assert.equal(config.headers['X-Pathment-Workspace'], 'acme');
    return { data: { data: { token: 'one-use-code' } } };
  });
  await Promise.all([f.handoff.runDomainHandoff(), f.handoff.runDomainHandoff()]);
  assert.equal(requests, 1);
  const destination = new URL(f.window.location.destination);
  assert.equal(destination.origin, 'https://app.pathment.me');
  assert.equal(destination.search, '');
  assert.ok(!destination.href.includes('existing'));
  assert.equal(new URLSearchParams(destination.hash.slice(1)).get('code'), 'one-use-code');
});

test('legacy issuance failure never changes a stored session or redirects to login', async () => {
  const f = fixture(`https://acme.pathment.me/session-handoff#challenge=${'c'.repeat(43)}&state=${'s'.repeat(43)}`, async () => { throw new Error('offline'); });
  await assert.rejects(f.handoff.runDomainHandoff());
  assert.equal(f.sessions.length, 0);
  assert.equal(f.window.location.destination, undefined);
});

test('expired legacy access refreshes once and retries only issuance', async () => {
  let requests = 0, refreshes = 0;
  const f = fixture(`https://acme.pathment.me/session-handoff#challenge=${'c'.repeat(43)}&state=${'s'.repeat(43)}`, async (_url, _body, config) => {
    requests++;
    if (requests === 1) throw { response: { status: 401 } };
    assert.equal(config.headers.Authorization, 'Bearer renewed');
    return { data: { data: { token: 'code' } } };
  }, { refresh: async () => { refreshes++; return 'renewed'; } });
  await f.handoff.runDomainHandoff();
  assert.equal(requests, 2);
  assert.equal(refreshes, 1);
});

test('transient refresh failure leaves source credentials untouched', async () => {
  let requests = 0;
  const f = fixture(`https://acme.pathment.me/session-handoff#challenge=${'c'.repeat(43)}&state=${'s'.repeat(43)}`, async () => { requests++; throw { response: { status: 401 } }; }, { refresh: async () => { throw new Error('offline'); } });
  await assert.rejects(f.handoff.runDomainHandoff());
  assert.equal(requests, 1);
  assert.equal(f.sessions.length, 0);
});

test('different destination account cannot be replaced by a valid handoff', async () => {
  const f = fixture('https://app.pathment.me/w/acme/session-handoff#code=code&state=s', async () => ({ data: { data: { user: { id: 'attacker', role: 'mentor' }, tokens: { accessToken: 'new', refreshToken: 'refresh' }, rememberSession: true } } }));
  f.sessionStorage.setItem('pathment-handoff-v1', JSON.stringify({ verifier: 'a'.repeat(43), state: 's', workspace: 'acme', expires: Date.now()+10000 }));
  await assert.rejects(f.handoff.runDomainHandoff(), /Another account/);
  assert.equal(f.sessions.length, 0);
  assert.equal(f.window.location.destination, undefined);
});
