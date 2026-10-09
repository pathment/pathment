const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadOrganizationsApi() {
  const exports = {};
  const code = ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '..', 'lib/services/organizations-api.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  vm.runInNewContext(code, {
    exports,
    require: (id) => {
      if (id === './api-client') return { apiClient: {} };
      throw new Error(`Unexpected dependency ${id}`);
    },
  });
  return exports;
}

const { resolveWorkspaceEntry } = loadOrganizationsApi();
const workspace = (slug) => ({ id: slug, slug, name: slug, status: 'active' });

test('opens a remembered workspace only when it is still accessible', () => {
  const alpha = workspace('alpha');
  const beta = workspace('beta');
  assert.equal(resolveWorkspaceEntry([alpha, beta], 'beta').workspace.slug, 'beta');
  assert.equal(resolveWorkspaceEntry([alpha, beta], 'removed').kind, 'choose');
});

test('a single accessible workspace opens without an extra choice', () => {
  const decision = resolveWorkspaceEntry([workspace('alpha')], null);
  assert.equal(decision.kind, 'open');
  assert.equal(decision.workspace.slug, 'alpha');
});

test('multiple or zero workspaces render the account picker', () => {
  assert.equal(resolveWorkspaceEntry([], null).kind, 'choose');
  assert.equal(resolveWorkspaceEntry([workspace('alpha'), workspace('beta')], null).kind, 'choose');
});
