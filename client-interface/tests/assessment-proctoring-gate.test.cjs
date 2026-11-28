const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Camera and screen share really do gate the start of a proctored intake
 * assessment.
 *
 * The server refuses a client that declares it cannot share a screen, or
 * cannot record where the paper asks for video — but what the client DECLARES
 * is only "this browser supports it". Support is not permission. A browser
 * that can share a screen, on a page where nobody granted it, would declare
 * itself capable and sail through a server check that only reads the
 * declaration.
 *
 * So the last gate is here: the runner must refuse to call `start` until a
 * screen share is actually live and a camera track actually exists. These pin
 * that, because it cannot be proved from the server side and a browser cannot
 * be made to grant a real screen share in a test.
 */

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const RUNNER = 'components/apply/AssessmentRunner.tsx';

test('the start is refused until the screen is actually being shared', () => {
  const source = read(RUNNER);

  // Not "supports screen share" — `live` is a share that is running now.
  assert.match(
    source, /if \(proctored && !screen\.live\) \{[^}]*return;/,
    'the runner no longer refuses to start a proctored attempt without a live screen share',
  );
});

test('the start is refused until a camera track actually exists', () => {
  const source = read(RUNNER);

  assert.match(source, /getVideoTracks\(\)/, 'the runner no longer reads the real camera tracks');
  assert.match(
    source, /if \(cameraRequired && !video\.length\) \{[^}]*return;/,
    'the runner no longer refuses to start without a camera track',
  );
});

test('both refusals come before the server is told to start the clock', () => {
  const source = read(RUNNER);
  const fn = source.slice(source.indexOf('const startFromSetup'), source.indexOf('const startFromSetup') + 1200);

  const screenGate = fn.indexOf('!screen.live');
  const cameraGate = fn.indexOf('!video.length');
  const begins = fn.indexOf('await begin()');

  assert.ok(screenGate > -1 && cameraGate > -1 && begins > -1, 'startFromSetup no longer has both gates and the start');
  assert.ok(screenGate < begins, 'the screen check moved after the clock starts');
  assert.ok(cameraGate < begins, 'the camera check moved after the clock starts');
});

test('what the browser declares to the server is its real support, not a guess', () => {
  const caps = read('lib/proctoring/capabilities.ts');
  assert.match(caps, /screenShareSupported\(\) \? 'screen' : null/);
  assert.match(caps, /videoRecordingSupported\(\) \? 'video' : null/);

  // And the runner sends exactly that, rather than a hardcoded list.
  assert.match(read(RUNNER), /startAssessment\(token, browserCapabilities\(\)\)/);
});
