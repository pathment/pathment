/**
 * The scoring rules, which decide who a programme calls its best mentees.
 *
 * These tests exist because the failure modes here are silent. A dimension
 * quietly counted as zero, or a switched-off dimension quietly costing everyone
 * its weight, produces a plausible looking number that is wrong, and nobody
 * notices until somebody is ranked below where they should be.
 */

const {
  DIMENSIONS,
  DIMENSION_KEYS,
  attendanceScore,
  effortHours,
  band,
  combine,
  difficultyWeight,
  resolveWeights
} = require('../../src/config/scoring');

// Derived, never hardcoded: retuning a weight is a product decision and should
// not break a test that is about the redistribution rule.
const DEFAULT_TOTAL = DIMENSION_KEYS.reduce((sum, k) => sum + DIMENSIONS[k].weight, 0);

describe('resolveWeights', () => {
  it('adds up to 100 by default', () => {
    const w = resolveWeights();
    const total = Object.values(w).reduce((s, n) => s + n, 0);
    expect(Math.round(total)).toBe(100);
  });

  it('still adds up to 100 when a clan switches attendance off', () => {
    // The whole point: turning a dimension off must not cost everybody its
    // weight, or scores drop and clans stop being comparable.
    const w = resolveWeights({}, ['attendance']);
    const total = Object.values(w).reduce((s, n) => s + n, 0);

    expect(Math.round(total)).toBe(100);
    expect(w.attendance).toBeUndefined();
  });

  it('shares a switched-off weight across the rest in proportion', () => {
    const base = resolveWeights();
    const without = resolveWeights({}, ['attendance']);

    const progress = DIMENSIONS.progress.weight;
    const remaining = DEFAULT_TOTAL - DIMENSIONS.attendance.weight;

    expect(Math.round(without.progress)).toBe(Math.round((progress / remaining) * 100));
    expect(without.progress).toBeGreaterThan(base.progress);
  });

  it('takes an org override for a single dimension', () => {
    const w = resolveWeights({ attendance: 30 });
    expect(w.attendance).toBeGreaterThan(resolveWeights().attendance);
  });

  it('treats a zero weight as switched off', () => {
    expect(resolveWeights({ attendance: 0 }).attendance).toBeUndefined();
  });

  it('ignores nonsense overrides rather than producing NaN weights', () => {
    const w = resolveWeights({ quality: 'lots', output: -5 });
    expect(Object.values(w).every(Number.isFinite)).toBe(true);
  });

  it('returns nothing when everything is switched off, rather than dividing by zero', () => {
    const w = resolveWeights({}, [...DIMENSION_KEYS]);
    expect(w).toEqual({});
  });
});

describe('combine', () => {
  const weights = resolveWeights();

  it('is the weighted average of the dimensions', () => {
    const { score } = combine(
      { progress: 100, output: 100, quality: 100, reliability: 100, attendance: 100, consistency: 100 },
      weights
    );
    expect(score).toBe(100);
  });

  it('drops a dimension with no data instead of scoring it zero', () => {
    // A clan that has never held a review has no attendance to read. Scoring
    // zero would say "they never turn up"; the truth is there was nothing to
    // turn up to.
    const withNull = combine(
      { progress: 80, output: 80, quality: 80, reliability: 80, attendance: null, consistency: 80 },
      weights
    );
    const withZero = combine(
      { progress: 80, output: 80, quality: 80, reliability: 80, attendance: 0, consistency: 80 },
      weights
    );

    expect(withNull.score).toBe(80);
    expect(withZero.score).toBeLessThan(80);
  });

  it('reports how much of the score it could actually cover', () => {
    const { covered } = combine({ progress: 80, output: 70 }, weights);
    expect(covered).toBe(DIMENSIONS.progress.weight + DIMENSIONS.output.weight);
  });

  it('explains itself: every part carries its share and what it contributed', () => {
    const { parts } = combine({ progress: 100, quality: 50 }, weights);
    const progress = parts.find((p) => p.key === 'progress');

    expect(progress.label).toBe('Progress');
    expect(progress.score).toBe(100);
    expect(progress.share + parts.find((p) => p.key === 'quality').share).toBe(100);
  });

  it('is null when there is nothing to go on, rather than zero', () => {
    expect(combine({}, weights).score).toBeNull();
    expect(combine({ progress: null }, weights).score).toBeNull();
  });

  it('keeps a score inside 0 and 100 whatever it is handed', () => {
    expect(combine({ progress: 400 }, weights).score).toBe(100);
    expect(combine({ progress: -40 }, weights).score).toBe(0);
  });
});

describe('attendanceScore', () => {
  it('counts present against present plus absent', () => {
    expect(attendanceScore({ present: 3, absent: 1 })).toBe(75);
  });

  it('does not count an excused absence against anybody', () => {
    // Telling your mentor you cannot come is the opposite of not turning up.
    expect(attendanceScore({ present: 3, absent: 0, excused: 5 })).toBe(100);
  });

  it('is null when nobody was marked, so a mentor forgetting the register costs the mentee nothing', () => {
    expect(attendanceScore({ present: 0, absent: 0 })).toBeNull();
    expect(attendanceScore({})).toBeNull();
    expect(attendanceScore()).toBeNull();
  });

  it('is zero only when somebody genuinely missed everything they were marked for', () => {
    expect(attendanceScore({ present: 0, absent: 4 })).toBe(0);
  });
});

describe('difficultyWeight', () => {
  it('rises with difficulty', () => {
    expect(difficultyWeight('easy')).toBeLessThan(difficultyWeight('medium'));
    expect(difficultyWeight('medium')).toBeLessThan(difficultyWeight('hard'));
    expect(difficultyWeight('hard')).toBeLessThan(difficultyWeight('expert'));
  });

  it('does not care about casing', () => {
    expect(difficultyWeight('HARD')).toBe(difficultyWeight('hard'));
  });

  it('falls back to the middle for anything unknown', () => {
    expect(difficultyWeight(null)).toBe(difficultyWeight('medium'));
    expect(difficultyWeight('impossible')).toBe(difficultyWeight('medium'));
  });
});

describe('band', () => {
  it('reads the number so nobody has to interpret it', () => {
    expect(band(95)).toBe('Exceptional');
    expect(band(72)).toBe('Strong');
    expect(band(41)).toBe('Needs attention');
  });

  it('says so plainly when there is not enough to judge', () => {
    expect(band(null)).toBe('Not enough yet');
  });
});

describe('effortHours', () => {
  it('prefers a stated estimate', () => {
    expect(effortHours({ estimatedHours: 5 })).toBe(5);
  });

  it('reads the snake case column too, since queries return raw rows', () => {
    expect(effortHours({ estimated_hours: 12 })).toBe(12);
  });

  it('falls back to the t-shirt size, which is what most tasks actually carry', () => {
    // Production splits these: older tasks have hours, newer linear roadmap
    // steps have a size, and nothing has both. Reading only one would make
    // two thirds of all finished work count for nothing.
    expect(effortHours({ effort: 's' })).toBe(2);
    expect(effortHours({ effort: 'l' })).toBe(8);
    expect(effortHours({ effort: 'XL' })).toBe(12);
  });

  it('rises with the size', () => {
    const sizes = ['xs', 's', 'm', 'l', 'xl'].map((effort) => effortHours({ effort }));
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
  });

  it('is null when a task says nothing about its size, so the dimension drops out', () => {
    expect(effortHours({})).toBeNull();
    expect(effortHours({ effort: 'enormous' })).toBeNull();
    expect(effortHours({ estimatedHours: 0 })).toBeNull();
  });
});
