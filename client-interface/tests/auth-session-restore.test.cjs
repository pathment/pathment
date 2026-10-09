const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function fixture({ access = null, refresh = null } = {}) {
  let accessToken = access;
  let refreshToken = refresh;
  let requests = 0;
  const tokenStore = {
    getToken: () => accessToken,
    getRefreshToken: () => refreshToken,
    setToken: (value) => { accessToken = value; },
    setRefreshToken: (value) => { refreshToken = value; },
    clearSession: () => { accessToken = null; refreshToken = null; },
  };
  const axios = {
    post: async () => {
      requests += 1;
      return { data: { data: { accessToken: 'restored-access', refreshToken: 'rotated-refresh' } } };
    },
  };
  const exports = {};
  const code = ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '..', 'lib/services/auth-session.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } },
  ).outputText;
  vm.runInNewContext(code, {
    exports,
    require: (id) => ({
      axios: { __esModule: true, default: axios },
      sonner: { toast: { error() {} } },
      './workspace-scope': { logicalPathname: (value) => value, workspacePath: (value) => value },
      '../config/api': { apiConfig: { baseUrl: 'https://api.test', endpoints: { refreshToken: '/auth/refresh' } } },
      './token-store': { tokenStore },
      '../utils/api-error': { getRateLimit: () => ({ limited: false, retryAfterSec: 0 }) },
    })[id] ?? (() => { throw new Error(`Unexpected dependency ${id}`); })(),
    window: {}, document: {}, setTimeout, clearTimeout, atob, console,
  });
  return { auth: exports, tokenStore, requests: () => requests };
}

test('restores a persisted session when only the refresh token remains', async () => {
  const f = fixture({ refresh: 'persisted-refresh' });
  assert.equal(await f.auth.restoreAccessToken(), 'restored-access');
  assert.equal(f.tokenStore.getToken(), 'restored-access');
  assert.equal(f.tokenStore.getRefreshToken(), 'rotated-refresh');
  assert.equal(f.requests(), 1);
});

test('does not refresh when an access token exists or no session is stored', async () => {
  const active = fixture({ access: 'current', refresh: 'refresh' });
  assert.equal(await active.auth.restoreAccessToken(), 'current');
  assert.equal(active.requests(), 0);

  const empty = fixture();
  assert.equal(await empty.auth.restoreAccessToken(), null);
  assert.equal(empty.requests(), 0);
});
