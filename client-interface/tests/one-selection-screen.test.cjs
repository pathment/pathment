const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/**
 * One ranking screen, two kinds of round.
 *
 * A selection round used to be a `CandidatePool`; it is a clan now, and both
 * shapes run side by side until the live rounds have moved. The server already
 * answers in identical shapes from both, so there is no reason for two
 * Selection screens — and every reason not to have two, because a rule fixed
 * in one and missed in the other is a round that ranks people differently from
 * the round beside it.
 *
 * These pin the arrangement that prevents that: the screen knows nothing about
 * either kind, both pages hand it the same thing, and the two api objects keep
 * the same contract.
 */

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

const SELECTION_TAB = 'components/admin/pools/SelectionTab.tsx';
const POOL_PAGE = 'app/admin/pools/[id]/page.tsx';
const ROUND_PAGE = 'app/admin/pools/rounds/[id]/page.tsx';

test('the Selection screen does not know which kind of round it is showing', () => {
  const source = read(SELECTION_TAB);

  // It must not reach for either api itself; it is handed one.
  assert.ok(!/\bpoolApi\b/.test(source), 'SelectionTab still calls poolApi directly');
  assert.ok(!/\broundApi\b/.test(source), 'SelectionTab still calls roundApi directly');

  // Nor read a pool's own fields — those are a CandidatePool's spelling of
  // terms both kinds of round have.
  assert.ok(!/\bpool\.(status|selectionQuota|id)\b/.test(source), 'SelectionTab still reads pool fields');

  // Its query keys are scoped by the round, so invalidating one kind never
  // refetches the other's screens.
  assert.match(source, /queryKey: \[round\.scope, round\.id, 'scores'\]/);
  assert.match(source, /queryKey: \[round\.scope, round\.id, 'shortlists'\]/);
  assert.match(source, /queryKey: \[round\.scope, round\.id, 'placement'\]/);
});

test('both kinds of round open the same Selection screen', () => {
  for (const page of [POOL_PAGE, ROUND_PAGE]) {
    const source = read(page);
    assert.match(source, /import \{ SelectionTab \}/, `${page} does not use the shared Selection screen`);
    assert.match(source, /<SelectionTab/, `${page} does not render the shared Selection screen`);
    assert.match(source, /scope: '(pools|rounds)'/, `${page} does not scope the round's query keys`);
  }

  // And they scope it differently, or one would read the other's cache.
  assert.match(read(POOL_PAGE), /scope: 'pools'/);
  assert.match(read(ROUND_PAGE), /scope: 'rounds'/);
});

test('both api objects keep the whole selection contract', () => {
  const contract = read('lib/services/round-api.ts');
  const block = contract.slice(
    contract.indexOf('export interface SelectionApi {'),
    contract.indexOf('type Envelope<T>'),
  );
  const required = [...block.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);

  // A contract nobody is held to is a comment. If this is empty the parse
  // broke, and the rest of the test would pass by saying nothing.
  assert.ok(required.length >= 8, `expected the selection contract to name its methods, found ${required.length}`);

  const poolApi = read('lib/services/pool-api.ts');
  const roundApi = contract;
  for (const method of required) {
    assert.match(poolApi, new RegExp(`\\n\\s*${method}: \\(`), `poolApi is missing ${method}`);
    assert.match(roundApi, new RegExp(`\\n\\s*${method}: \\(`), `roundApi is missing ${method}`);
  }
});

test('a round reaches its own endpoints, under the clan that it is', () => {
  const source = read('lib/services/round-api.ts');
  // Every round call hangs off the clan, because a round IS one. A path that
  // forked off to /pools/:id would be the old shape creeping back.
  assert.match(source, /const at = \(id: string\) => `\/clans\/\$\{id\}\/selection`/);
  assert.ok(!/`\/pools\/\$\{/.test(source), 'a round call is still pointed at a pool');
});
