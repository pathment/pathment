/**
 * The parts of the performance score that are arithmetic rather than queries.
 *
 * These matter because they decide an ordering between real people, and their
 * failure modes are quiet: a percentile that crowns the only member of a clan,
 * or a difficulty weighting that treats a week of work as one row.
 */

jest.mock('../../src/db', () => ({
  models: {},
  sequelize: { query: jest.fn(), fn: jest.fn(), col: jest.fn() }
}));

const perf = require('../../src/services/performanceService');

describe('weightedOutput', () => {
  it('counts a hard task for more than an easy one', () => {
    const easy = perf.weightedOutput({ tasksEasy: 3, tasksMedium: 0, tasksHard: 0 });
    const hard = perf.weightedOutput({ tasksEasy: 0, tasksMedium: 0, tasksHard: 3 });

    expect(hard).toBeGreaterThan(easy);
  });

  it('can rank fewer hard tasks above more easy ones', () => {
    // The whole point: three of the hardest steps is more of the programme than
    // six of the easiest, and a row count says the opposite.
    const sixEasy = perf.weightedOutput({ tasksEasy: 6, tasksMedium: 0, tasksHard: 0 });
    const threeHard = perf.weightedOutput({ tasksEasy: 0, tasksMedium: 0, tasksHard: 3 });

    expect(threeHard).toBeGreaterThan(sixEasy);
  });

  it('is zero for somebody who has finished nothing', () => {
    expect(perf.weightedOutput({})).toBe(0);
  });
});

describe('percentile', () => {
  it('places a value among its peers', () => {
    expect(perf.percentile(10, [1, 2, 3, 10])).toBeGreaterThan(perf.percentile(2, [1, 2, 3, 10]));
  });

  it('does not crown the only mentee in a clan', () => {
    // Being the only person there is not an achievement, and 100 would put them
    // top of an organisation-wide board on no evidence at all.
    expect(perf.percentile(999, [999])).toBe(50);
    expect(perf.percentile(0, [])).toBe(50);
  });

  it('scores identical work identically', () => {
    const all = [5, 5, 5, 5];
    expect(perf.percentile(5, all)).toBe(perf.percentile(5, all));
    expect(perf.percentile(5, all)).toBe(50);
  });

  it('puts the bottom of the group below the top', () => {
    const all = [1, 5, 9];
    expect(perf.percentile(1, all)).toBeLessThan(perf.percentile(9, all));
  });

  it('stays within 0 and 100', () => {
    const all = [1, 2, 3];
    for (const v of [0, 1, 2, 3, 99]) {
      const p = perf.percentile(v, all);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
    }
  });
});
