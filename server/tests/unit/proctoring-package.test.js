'use strict';

/**
 * The proctoring package on its own: a new host can register its table, the
 * reviewer's summary totals the interruptions (came back, offline, out of
 * fullscreen), and events of any kind pass through the cleaner.
 */
const { media, rules } = require('../../src/proctoring');

describe('proctoring package', () => {
  it('lets a new host register its attempts table, and refuses a bad name', () => {
    media.registerLogTable('exam_attempts');
    expect(media.LOG_TABLES.has('exam_attempts')).toBe(true);
    expect(() => media.registerLogTable('x; drop table users')).toThrow(/Not a table name/);
  });

  it('totals the interruptions for the reviewer', () => {
    const at = (s) => new Date(Date.UTC(2026, 0, 1, 10, 0, s)).toISOString();
    const log = [
      { type: 'attempt_opened', at: at(0), meta: {} },
      { type: 'snapshot', at: at(5), meta: { url: 'https://x/1.jpg', source: 'screen' } },
      { type: 'connection_lost', at: at(10), meta: {} },
      { type: 'connection_restored', at: at(40), meta: { downMs: 30000 } },
      { type: 'fullscreen_exit', at: at(50), meta: {} },
      { type: 'fullscreen_restored', at: at(62), meta: { awayMs: 12000 } },
      { type: 'attempt_opened', at: at(120), meta: { awayMs: 190000, sameDevice: true } },
      { type: 'focus_loss', at: at(130), meta: {} },
    ];
    const out = media.splitProctorLog(log, []);
    expect(out.snapshots).toHaveLength(1);
    expect(out.stats).toEqual({
      opens: 2, resumes: 1, awayMs: 190000,
      offline: 1, offlineMs: 30000,
      fullscreenExits: 1, fullscreenOutMs: 12000,
      fullscreenUnavailable: false,
    });
    expect(out.flagCounts.focus_loss).toBe(1);
  });

  it('passes new event kinds through the cleaner, but never a forged snapshot', () => {
    const cleaned = media.cleanClientEvents([
      { type: 'connection_lost' }, { type: 'fullscreen_unavailable', meta: { reason: 'refused' } }, { type: 'snapshot', meta: { url: 'x' } },
    ]);
    expect(cleaned.map((e) => e.type)).toEqual(['connection_lost', 'fullscreen_unavailable']);
  });

  it('keeps the recording limits in one place', () => {
    expect(rules.maxRecordingSeconds({ maxRecordingSeconds: 999 })).toBe(300);
    expect(rules.videoPublicIdPrefix('exams', 'a1', 'q1')).toMatch(/^pathment\/exams\/videos\/a1\/q1-/);
  });
});
