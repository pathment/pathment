'use strict';

/**
 * The question every `kind` check was really asking.
 *
 * With two kinds, `kind === 'standing'` and `kind !== 'cohort'` are the same
 * sentence. With three they are not, and the difference decides whether a
 * selection round's work reaches certificates, rankings and programme
 * progress. These pin the meaning so a fourth kind cannot quietly fail open
 * the way a third would have.
 */

const {
  COHORT, STANDING, POOL, CLAN_KINDS,
  kindOf, isProgrammeClan, isNonProgrammeClan, isPoolClan, isStandingClan,
} = require('../../src/config/clanKinds');

describe('what counts towards the programme', () => {
  it('only a cohort clan does', () => {
    expect(isProgrammeClan({ kind: COHORT })).toBe(true);
    expect(isProgrammeClan({ kind: STANDING })).toBe(false);
    expect(isProgrammeClan({ kind: POOL })).toBe(false);
  });

  it('a pool is outside the programme\'s accounting, exactly as standing is', () => {
    // The whole point: a third kind inherits the safe answer rather than
    // falling through to "treat it as a real programme clan".
    expect(isNonProgrammeClan({ kind: POOL })).toBe(true);
    expect(isNonProgrammeClan({ kind: STANDING })).toBe(true);
    expect(isNonProgrammeClan({ kind: COHORT })).toBe(false);
  });

  it('still tells the two non-programme kinds apart when that is the question', () => {
    // Continuing a closed programme is about standing clans specifically.
    expect(isStandingClan({ kind: STANDING })).toBe(true);
    expect(isStandingClan({ kind: POOL })).toBe(false);
    expect(isPoolClan({ kind: POOL })).toBe(true);
    expect(isPoolClan({ kind: STANDING })).toBe(false);
  });
});

describe('reading the kind off whatever the caller has', () => {
  it('takes a row, a plain object or the string itself', () => {
    expect(kindOf({ kind: POOL })).toBe(POOL);
    expect(kindOf(POOL)).toBe(POOL);
  });

  it('treats a missing clan or a missing kind as the ordinary case', () => {
    // A null clan must never read as "not a programme clan" — that would turn
    // a lookup failure into a silent exemption from enrollment and ranking.
    expect(kindOf(null)).toBe(COHORT);
    expect(kindOf(undefined)).toBe(COHORT);
    expect(kindOf({})).toBe(COHORT);
    expect(isProgrammeClan(null)).toBe(true);
    expect(isNonProgrammeClan(null)).toBe(false);
  });
});

describe('the list of kinds', () => {
  it('is the one the model validates against', () => {
    expect(CLAN_KINDS).toEqual([COHORT, STANDING, POOL]);
  });
});
