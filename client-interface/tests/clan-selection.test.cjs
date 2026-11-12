const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../lib/utils/clan-selection.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const loaded = { exports: {} };
new Function('exports', 'module', compiled.outputText)(loaded.exports, loaded);
const { ALL_CLANS, defaultClanOf, resolveMentorClan, resolveMenteeClan, visibleClansFor } = loaded.exports;

const live = { id: 'live', kind: 'cohort', frozenAt: null };
const standing = { id: 'standing', kind: 'standing', frozenAt: null };
const finished = { id: 'finished', kind: 'cohort', frozenAt: '2026-01-01' };

test('the clan they picked last time is the clan they get', () => {
  assert.equal(resolveMentorClan('live', [live, standing], false), 'live');
  assert.equal(resolveMenteeClan('standing', [live, standing], false), 'standing');
});

test('never having chosen does not mean "All clans"', () => {
  // The complaint: open Pathment, land on a merged view of everything.
  assert.equal(resolveMentorClan('', [live, standing], false), 'live');
  assert.notEqual(resolveMentorClan('', [live, standing], false), ALL_CLANS);
});

test('a stored "All clans" is migrated to a real clan, not honoured', () => {
  // The merged view is gone: a mentor works in one clan. Anyone carrying the
  // old choice must be moved on rather than parked on a scope the picker can
  // no longer show.
  assert.equal(resolveMentorClan(ALL_CLANS, [live, standing], false), 'live');
  assert.notEqual(resolveMentorClan(ALL_CLANS, [live, standing], false), ALL_CLANS);
});

test('a stored "All clans" is not rewritten while the clan list is unknown', () => {
  // Settling on a real clan needs the list. Answering early is how the saved
  // choice used to get clobbered on every sign-in.
  assert.equal(resolveMentorClan(ALL_CLANS, [], true), ALL_CLANS);
});

test('a mentor with no clans has nothing better than "All clans"', () => {
  assert.equal(resolveMentorClan(ALL_CLANS, [], false), ALL_CLANS);
});

test('a live clan is preferred over a finished one when migrating off "All clans"', () => {
  assert.equal(resolveMentorClan(ALL_CLANS, [finished, live], false), 'live');
});

test('a finished programme is never the landing clan while a live one exists', () => {
  assert.equal(resolveMentorClan('', [finished, live], false), 'live');
  assert.equal(resolveMenteeClan('', [finished, standing], false), 'standing');
  // ...but it is better than nothing when it is all there is.
  assert.equal(resolveMentorClan('', [finished], false), 'finished');
});

/**
 * The regression that caused the flash: memberships arrive asynchronously, so
 * the list is empty for the first render. Treating that as "your clan is gone"
 * dropped everyone to All clans for a beat on every single page load.
 */
test('an empty list while loading is not evidence the clan is gone', () => {
  assert.equal(resolveMentorClan('live', [], true), 'live');
  assert.equal(resolveMenteeClan('standing', [], true), 'standing');
});

test('a clan that really has gone falls forward to a live one', () => {
  assert.equal(resolveMentorClan('removed-clan', [live, standing], false), 'live');
  assert.equal(resolveMenteeClan('removed-clan', [standing], false), 'standing');
});

test('before storage is read nothing is claimed', () => {
  assert.equal(resolveMentorClan(null, [live], false), ALL_CLANS);
  assert.equal(resolveMenteeClan(null, [live], false), '');
});

test('a mentor with no clans at all has nothing to land on', () => {
  assert.equal(resolveMentorClan('', [], false), ALL_CLANS);
  assert.equal(resolveMenteeClan('', [], false), '');
  assert.equal(defaultClanOf([]), null);
});

/**
 * The regression the browser caught: `loading` is false while the memberships
 * query is still DISABLED (before the user's roles are known), so the clan list
 * is an empty array meaning "not asked yet". Treating that as "no clans" made
 * the resolver discard the saved clan and answer "all" — which then got written
 * to storage, erasing the selection on every sign-in.
 */
test('an unasked clan list never discards the saved choice', () => {
  assert.equal(resolveMentorClan('live', [], true), 'live');
  assert.equal(resolveMenteeClan('standing', [], true), 'standing');
});

test('once the list is known, a clan that really is gone falls back', () => {
  assert.equal(resolveMentorClan('removed', [live], false), 'live');
  assert.equal(resolveMenteeClan('removed', [standing], false), 'standing');
});

// ── which clans a clan-scoped learner screen shows ───────────────────────────
test('a learner screen shows only the clan chosen in the sidebar', () => {
  // The complaint: "My clan" stacked the finished cohort AND the standing clan
  // that continued it, each with its own ask-to-move.
  assert.deepEqual(visibleClansFor([live, standing], 'standing'), [standing]);
  assert.equal(visibleClansFor([live, standing], 'live').length, 1);
});

test('with no clan chosen it shows everything rather than nothing', () => {
  // '' is a selection pool being the scope, or storage not read yet. An empty
  // page called "My clan" would read as "you are in no clan".
  assert.deepEqual(visibleClansFor([live, standing], ''), [live, standing]);
});

test('a chosen clan that is not theirs falls back to the whole list', () => {
  assert.deepEqual(visibleClansFor([live, standing], 'someone-elses-clan'), [live, standing]);
});
