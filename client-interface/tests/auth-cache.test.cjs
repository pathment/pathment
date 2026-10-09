const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
function storage() { const data = new Map(); return { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,String(v)), removeItem: k => data.delete(k) }; }
function load(file, mocks, globals) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, require: k => { if (!(k in mocks)) throw Error(k); return mocks[k]; }, console, ...globals });
  return exports;
}
const admin = { id: 'person', role: 'admin', capabilities: ['admin'] };
function fixture(remember = true) {
  let workspace = 'alpha';
  let request = async () => ({ data: { user: admin } });
  const globals = { window: {}, localStorage: storage(), sessionStorage: storage() };
  const scope = { activeWorkspaceSlug: () => workspace };
  const { tokenStore } = load('lib/services/token-store.ts', { './workspace-scope': scope }, globals);
  tokenStore.setSession({ token: 'access', refreshToken: 'refresh', user: admin }, remember);
  // Exercise the real provider callbacks with deterministic hook state. Effects
  // are omitted: tests call refreshUser explicitly, without timers or a DOM.
  // This is a behavioral unit harness, not a React lifecycle/browser test.
  const state = []; let cursor = 0;
  const react = {
    createContext: () => ({ Provider: 'provider' }),
    createElement: (type, props) => props.value,
    useState: initial => { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], v => { state[i] = typeof v === 'function' ? v(state[i]) : v; }]; },
    useRef: initial => { const i = cursor++; if (!(i in state)) state[i] = { current: initial }; return state[i]; },
    useCallback: fn => fn, useEffect: () => {},
  };
  const { AuthProvider } = load('lib/context/AuthContext.tsx', {
    react, axios: { isAxiosError: e => !!e?.isAxiosError }, '../services/workspace-scope': scope,
    '@tanstack/react-query': { useQueryClient: () => ({ clear() {} }) },
    '../services/token-store': { tokenStore }, '../services/api-client': { apiClient: { get: () => request() } },
    '../config/api': { apiConfig: { endpoints: { me: '/auth/me' } } },
    '../services/auth-session': {
      SessionExpiredError: class SessionExpiredError extends Error {},
      startAuthSession: () => {}, resetAuthSession: () => {},
      restoreAccessToken: async () => tokenStore.getToken(),
    },
  }, globals);
  const render = () => { cursor = 0; return AuthProvider({ children: null }); };
  return { ...globals, tokenStore, render, scope: value => { workspace = value; }, fail: error => { request = async () => { throw error; }; }, respond: user => { request = async () => ({ data: { user } }); }, request: fn => { request = fn; } };
}
for (const remember of [true, false]) {
  test(`cache stamp lifecycle (${remember ? 'local' : 'session'}) preserves handoff identity`, () => {
    const f = fixture(remember); const t = f.tokenStore;
    assert.equal(t.getCachedUserWorkspace(), 'alpha');
    f.scope('beta'); assert.equal(t.getUser().id, 'person'); assert.equal(t.getCachedUserWorkspace(), 'alpha');
    t.setUser(admin); assert.equal(t.getCachedUserWorkspace(), 'beta');
    t.invalidateCachedUserWorkspace(); assert.equal(t.getCachedUserWorkspace(), null); assert.equal(t.getUser().id, 'person'); assert.equal(t.getToken(), 'access');
    t.setSession({ token:'new', refreshToken:'new-refresh' }, remember); assert.equal(t.getUser(), null); assert.equal(t.getCachedUserWorkspace(), null);
    t.setUser(admin); t.clearSession(); assert.equal(t.getCachedUserWorkspace(), null);
    for (const store of [f.localStorage, f.sessionStorage]) for (const key of ['token','refreshToken','user','userWorkspace']) assert.equal(store.getItem(key), null);
  });
}
for (const status of [401,403,400,404,422]) test(`${status} never restores capabilities`, async () => {
  const f=fixture(); f.fail({ response: { status } }); await f.render().refreshUser();
  const value=f.render(); assert.equal(value.user,null); assert.equal(value.availableRoles.length,0); assert.equal(value.activeRole,null);
  assert.equal(f.tokenStore.getToken(), status === 401 ? null : 'access');
  assert.equal(f.tokenStore.getRefreshToken(), status === 401 ? null : 'refresh');
});
for (const error of [{response:{status:408}}, {response:{status:429}}, {response:{status:500}}, {response:{status:503}}, {isAxiosError:true,request:{},code:'ERR_NETWORK'}, {isAxiosError:true,request:{},code:'ECONNABORTED'}]) {
  test(`transient ${error.response?.status || error.code}: same workspace only`, async () => {
    const f=fixture(); f.fail(error); await f.render().refreshUser(); assert.equal(f.render().user.id,'person');
    f.scope('beta'); await f.render().refreshUser(); assert.equal(f.render().user,null); assert.equal(f.tokenStore.getToken(),'access');
  });
}
test('unstamped cache and missing workspace fail closed', async () => {
  const f=fixture(); f.tokenStore.invalidateCachedUserWorkspace(); f.fail({response:{status:503}}); await f.render().refreshUser(); assert.equal(f.render().user,null);
  f.scope(null); f.tokenStore.setUser(admin); await f.render().refreshUser(); assert.equal(f.render().user,null);
});
test('403 invalidates cache so subsequent outage cannot resurrect denied roles', async () => {
  const f=fixture(); f.fail({response:{status:403}}); await f.render().refreshUser();
  assert.equal(f.tokenStore.getUser().id,'person'); assert.equal(f.tokenStore.getCachedUserWorkspace(),null);
  f.fail({response:{status:503}}); await f.render().refreshUser(); assert.equal(f.render().user,null);
});
test('explicit empty capabilities and successful revalidation', async () => {
  const f=fixture(); f.respond({...admin,capabilities:[]}); await f.render().refreshUser();
  const value=f.render(); assert.equal(value.availableRoles.length,0); value.setActiveRole('admin'); assert.equal(f.render().activeRole,null);
  f.scope('beta'); f.respond({...admin,role:'mentee',capabilities:['mentee']}); await f.render().refreshUser();
  assert.equal(f.tokenStore.getCachedUserWorkspace(),'beta'); assert.equal(f.render().availableRoles[0],'mentee');
});
test('plain runtime errors and cancellation do not permit fallback', async () => {
  for (const error of [new Error('bug'), {isAxiosError:true,request:{},code:'ERR_CANCELED'}]) {
    const f=fixture(); f.fail(error); await f.render().refreshUser(); assert.equal(f.render().user,null); assert.equal(f.tokenStore.getToken(),'access');
  }
});
test('malformed success invalidates prior cache', async () => {
  const f=fixture(); f.respond(undefined); await f.render().refreshUser(); assert.equal(f.render().user,null); assert.equal(f.tokenStore.getCachedUserWorkspace(),null);
});
test('late result cannot stamp a different workspace', async () => {
  const f=fixture(); let resolve; f.request(()=>new Promise(r=>{resolve=r;}));
  const pending=f.render().refreshUser(); await new Promise(setImmediate); f.scope('beta'); resolve({data:{user:admin}}); await pending;
  assert.equal(f.render().user,null); assert.equal(f.tokenStore.getCachedUserWorkspace(),'alpha');
});
test('newer denial wins over an older successful request', async () => {
  const f=fixture(); let resolve; f.request(()=>new Promise(r=>{resolve=r;})); const pending=f.render().refreshUser();
  await new Promise(setImmediate); f.fail({response:{status:403}}); await f.render().refreshUser(); resolve({data:{user:admin}}); await pending;
  assert.equal(f.render().user,null); assert.equal(f.tokenStore.getCachedUserWorkspace(),null);
});

test('403 removes already-visible roles while retaining the global session', async () => {
  const f = fixture();
  await f.render().refreshUser();
  f.render().setActiveRole('admin');
  assert.equal(f.render().activeRole, 'admin');
  assert.equal(f.render().isAuthenticated, true);

  f.fail({ response: { status: 403 } });
  await f.render().refreshUser();
  const denied = f.render();
  assert.equal(denied.user, null);
  assert.equal(denied.isAuthenticated, false);
  assert.equal(denied.activeRole, null);
  assert.equal(denied.availableRoles.length, 0);
  assert.equal(denied.isLoading, false);
  assert.equal(f.tokenStore.getToken(), 'access');
  assert.equal(f.tokenStore.getRefreshToken(), 'refresh');
  assert.equal(f.tokenStore.getUser().id, 'person');
});

test('changing remember mode removes the old store and its workspace stamp', () => {
  for (const remember of [true, false]) {
    const f = fixture(remember);
    f.scope('beta');
    f.tokenStore.setSession({ token: 'replacement', refreshToken: 'replacement-refresh', user: admin }, !remember);
    const previous = remember ? f.localStorage : f.sessionStorage;
    for (const key of ['token', 'refreshToken', 'user', 'userWorkspace', 'rememberMode']) {
      assert.equal(previous.getItem(key), null);
    }
    assert.equal(f.tokenStore.getCachedUserWorkspace(), 'beta');
    assert.equal(f.tokenStore.getToken(), 'replacement');
    assert.equal(f.tokenStore.isRememberedSession(), !remember);
  }
});
