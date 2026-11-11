'use strict';

/**
 * The rule every auto-distribution shares: propose the active clan with the
 * fewest ACTIVE (non-paused) mentees, respect capacity (which paused mentees
 * still occupy), and never propose an inactive clan.
 */
jest.mock('../../src/db', () => ({ models: {}, sequelize: {} }));

const { pickLeastLoaded, loadReason } = require('../../src/services/clanDistribution');
const { isClanOperational, isClanSuggestable } = require('../../src/config/clanStatus');

const clan = (id, over = {}) => ({ id, name: id, status: 'active', active: 0, paused: 0, seated: 0, cap: 25, ...over });

describe('clan status semantics', () => {
  test('inactive clans still work but are never suggested', () => {
    expect(isClanOperational('inactive')).toBe(true);
    expect(isClanSuggestable('inactive')).toBe(false);
  });
  test('archived clans neither work nor are suggested', () => {
    expect(isClanOperational('archived')).toBe(false);
    expect(isClanSuggestable('archived')).toBe(false);
  });
  test('a missing status reads as active', () => {
    expect(isClanOperational(null)).toBe(true);
    expect(isClanSuggestable(undefined)).toBe(true);
  });
});

describe('pickLeastLoaded', () => {
  test('prefers fewest active mentees, not most free seats', () => {
    // A has 12 paused: 20 seated but only 8 attending. B has 14 who all attend.
    const pick = pickLeastLoaded([
      clan('A', { active: 8, paused: 12, seated: 20 }),
      clan('B', { active: 14, seated: 14 }),
    ]);
    expect(pick.id).toBe('A');
  });

  test('never proposes an inactive clan, even an empty one', () => {
    const pick = pickLeastLoaded([
      clan('Quiet', { status: 'inactive' }),
      clan('Busy', { active: 20, seated: 20 }),
    ]);
    expect(pick.id).toBe('Busy');
  });

  test('skips a clan whose seats are all taken, paused included', () => {
    const pick = pickLeastLoaded([
      clan('Full', { active: 2, paused: 23, seated: 25 }),
      clan('Room', { active: 10, seated: 10 }),
    ]);
    expect(pick.id).toBe('Room');
  });

  test('returns null when nothing qualifies', () => {
    expect(pickLeastLoaded([clan('X', { status: 'inactive' })])).toBeNull();
    expect(pickLeastLoaded([])).toBeNull();
  });

  test('spreads a batch evenly by counting earlier proposals', () => {
    const clans = [clan('A', { active: 5, seated: 5 }), clan('B', { active: 3, seated: 3 })];
    const planned = new Map();
    const picks = [];
    for (let i = 0; i < 6; i += 1) {
      const p = pickLeastLoaded(clans, { planned });
      picks.push(p.id);
      planned.set(p.id, (planned.get(p.id) || 0) + 1);
    }
    // B catches up to A first, then they alternate: final load A=7, B=7.
    expect(picks.filter((x) => x === 'A')).toHaveLength(2);
    expect(picks.filter((x) => x === 'B')).toHaveLength(4);
  });

  test('planned proposals count against capacity', () => {
    const planned = new Map([['A', 1]]);
    const pick = pickLeastLoaded([clan('A', { cap: 2, seated: 1 }), clan('B', { active: 9, seated: 9 })], { planned });
    expect(pick.id).toBe('B');
  });

  test('ties break on room, then name, so a re-run proposes the same thing', () => {
    const pick = pickLeastLoaded([clan('Zed', { cap: 30 }), clan('Alpha', { cap: 30 }), clan('Mid', { cap: 10 })]);
    expect(pick.id).toBe('Alpha');
  });

  test('the reason names the load the admin is trusting', () => {
    expect(loadReason({ active: 4, paused: 2 }, 1)).toBe('Fewest active mentees (5 active, 2 paused)');
  });
});
