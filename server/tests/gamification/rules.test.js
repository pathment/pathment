const { Op } = require('sequelize');
jest.mock('../../src/db', () => {
  const model = () => ({ findOne: jest.fn(), findByPk: jest.fn(), findAll: jest.fn().mockResolvedValue([]),
    findOrCreate: jest.fn(),
    count: jest.fn().mockResolvedValue(0), sum: jest.fn().mockResolvedValue(0), create: jest.fn(), update: jest.fn() });
  const models = Object.fromEntries(['MenteeProfile', 'MentorProfile', 'PointsHistory', 'Badge', 'UserBadge',
    'AuditLog', 'User', 'Enrollment', 'DailyLogEntry', 'TaskProgressEntry', 'UserSettings'].map(name => [name, model()]));
  return { models, Sequelize: require('sequelize'), sequelize: { transaction: jest.fn(fn => fn({ LOCK: { UPDATE: 'UPDATE' } })) } };
});
jest.mock('../../src/services/authzService', () => ({ getCapabilities: jest.fn().mockResolvedValue(['mentor']) }));
jest.mock('../../src/services/performanceService', () => ({}));
jest.mock('../../src/services/menteeProfile', () => ({}));
jest.mock('../../src/utils/auditContext', () => ({ getRequestContext: () => ({ organizationId: 'org-a', userId: 'admin' }) }));
const { models } = require('../../src/db');
const game = require('../../src/services/gamificationService');
const transaction = { LOCK: { UPDATE: 'UPDATE' } };
let profile;

beforeEach(() => {
  jest.clearAllMocks();
  profile = { totalPoints: 600, organizationId: 'org-a', update: jest.fn().mockResolvedValue({}) };
  models.MenteeProfile.findOne.mockResolvedValue(profile);
  models.MentorProfile.findOne.mockResolvedValue(null);
  models.PointsHistory.findOne.mockResolvedValue(null);
  models.PointsHistory.sum.mockResolvedValue(0);
  models.PointsHistory.create.mockImplementation(async data => data);
  models.Badge.findByPk.mockResolvedValue(null);
  models.UserBadge.count.mockResolvedValue(0);
  models.Enrollment.count.mockResolvedValue(0);
  models.AuditLog.create.mockResolvedValue({});
});

test('ledger and total are written using the same transaction and profile lock', async () => {
  const result = await game._writePoints('user', 10, 'task_completed', 'task', 'Completed', 'task_completed:task', transaction);
  expect(models.MenteeProfile.findOne).toHaveBeenCalledWith(expect.objectContaining({ transaction, lock: 'UPDATE' }));
  expect(models.PointsHistory.create).toHaveBeenCalledWith(expect.objectContaining({ pointsBefore: 600, pointsAfter: 610, eventKey: 'task_completed:task' }), { transaction });
  expect(profile.update).toHaveBeenCalledWith({ totalPoints: 610 }, { transaction });
  expect(result.pointsAwarded).toBe(10);
});

test('legacy source records prevent a new event key from paying again', async () => {
  models.PointsHistory.findOne.mockResolvedValue({ id: 'old-ledger-entry', eventKey: null });
  const result = await game._writePoints('user', 10, 'task_completed', 'task', '', 'task_completed:task', transaction);
  const query = models.PointsHistory.findOne.mock.calls[0][0];
  expect(query.where[Op.or]).toContainEqual({ userId: 'user', sourceType: 'task_completed', sourceId: 'task' });
  expect(result.alreadyAwarded).toBe(true);
  expect(models.PointsHistory.create).not.toHaveBeenCalled();
  expect(profile.update).not.toHaveBeenCalled();
});

test('legacy streak milestone reason also prevents replay', async () => {
  models.PointsHistory.findOne.mockResolvedValue({ id: 'legacy-streak' });
  await game._writePoints('user', 50, 'streak_bonus', null, '7 day streak bonus', 'streak:7', transaction);
  expect(models.PointsHistory.findOne.mock.calls[0][0].where[Op.or]).toContainEqual({ userId: 'user', sourceType: 'streak_bonus', reason: '7 day streak bonus' });
  expect(models.PointsHistory.create).not.toHaveBeenCalled();
});

test.each([NaN, Infinity, 1.5, -1, 0])('invalid XP %s is rejected before writing', async amount => {
  await expect(game.awardPoints('user', amount, 'task_completed', 'task')).rejects.toThrow(/Invalid points/);
  expect(models.PointsHistory.create).not.toHaveBeenCalled();
});

test('signed adjustments floor at zero and ledger records only the applied amount', async () => {
  const result = await game._writePoints('user', -900, 'correction', null, 'Correction', null, transaction);
  expect(result.applied).toBe(-600);
  expect(result.totalPoints).toBe(0);
});

test('mentor aggregate totals and daily caps explicitly filter organization', async () => {
  models.MenteeProfile.findOne.mockResolvedValue(null);
  models.MentorProfile.findOne.mockResolvedValue({ organizationId: 'org-b' });
  models.PointsHistory.sum.mockResolvedValueOnce(500).mockResolvedValueOnce(90);
  const result = await game._writePoints('mentor', 25, 'community_answer', 'answer', '', 'answer', transaction);
  expect(result.pointsAwarded).toBe(10);
  expect(result.totalPoints).toBe(510);
  for (const call of models.PointsHistory.sum.mock.calls) expect(call[1].where.organizationId).toBe('org-b');
  expect(profile.update).not.toHaveBeenCalled();
});

test('mentor kudos and review counts do not award XP', async () => {
  models.MenteeProfile.findOne.mockResolvedValue(null);
  models.MentorProfile.findOne.mockResolvedValue({ organizationId: 'org-a' });
  for (const type of ['community_kudos', 'task_completed', 'daily_login']) {
    expect((await game._writePoints('mentor', 25, type, 'source', '', type, transaction)).pointsAwarded).toBe(0);
  }
  expect(models.PointsHistory.create).not.toHaveBeenCalled();
});

test('login does not award new XP', async () => {
  await game.awardDailyLoginPoint('user');
  expect(models.PointsHistory.create).not.toHaveBeenCalled();
});

test('completed program and badge criteria read authoritative rows', async () => {
  models.Enrollment.count.mockResolvedValue(1);
  expect(await game.checkBadgeCriteria('user', { criteriaType: 'programs_completed', criteriaValue: { count: 1 } }, profile)).toBe(true);
  expect(models.Enrollment.count).toHaveBeenCalledWith({ where: { menteeId: 'user', status: 'program_completed' } });
  await game.checkBadgeCriteria('user', { criteriaType: 'badges_earned', criteriaValue: { count: 5 } }, profile);
  expect(models.UserBadge.count).toHaveBeenCalledWith({ where: { userId: 'user', revokedAt: null } });
});

test('badges with earned awards cannot change XP or rules', async () => {
  models.Badge.findByPk.mockResolvedValue({ pointsReward: 50, criteriaType: 'custom', toJSON: () => ({ criteriaType: 'custom', pointsReward: 50 }) });
  models.UserBadge.count.mockResolvedValue(1);
  await expect(game.saveBadge('badge', { pointsReward: 500 })).rejects.toThrow(/earned badge/);
  expect(models.AuditLog.create).not.toHaveBeenCalled();
});

test('mentor auto criteria are allowed; unknown mentor rules and mentee misuse rejected', async () => {
  models.Badge.create.mockImplementation(async data => ({ ...data, id: 'new', toJSON: () => data }));
  await game.saveBadge(null, {
    name: 'Answers', description: 'x', category: 'mentor', audience: 'mentor',
    criteriaType: 'mentor_accepted_answers', criteriaValue: { count: 3 }, pointsReward: 10,
  });
  expect(models.Badge.create).toHaveBeenCalledWith(expect.objectContaining({
    criteriaType: 'mentor_accepted_answers',
  }), { transaction });
  await expect(game.saveBadge(null, {
    name: 'Bad', description: 'x', category: 'mentor', audience: 'mentor',
    criteriaType: 'tasks_completed', criteriaValue: { count: 1 },
  })).rejects.toThrow(/supported automatic rule|manual recognition/);
  await expect(game.saveBadge(null, {
    name: 'Misuse', description: 'x', category: 'achievement', audience: 'mentee',
    criteriaType: 'mentor_accepted_answers', criteriaValue: { count: 1 },
  })).rejects.toThrow(/only available for mentor/);
});

test('badge iconUrl accepts presets and rejects external URLs', async () => {
  models.Badge.create.mockImplementation(async data => ({ ...data, id: 'new', toJSON: () => data }));
  await game.saveBadge(null, {
    name: 'Iconed', description: 'x', category: 'achievement', criteriaType: 'custom',
    criteriaValue: { manual: true }, iconUrl: 'flame',
  });
  expect(models.Badge.create).toHaveBeenCalledWith(expect.objectContaining({ iconUrl: 'preset:flame' }), { transaction });
  await expect(game.saveBadge(null, {
    name: 'Bad', description: 'x', category: 'achievement', criteriaType: 'custom',
    criteriaValue: { manual: true }, iconUrl: 'https://evil.example/a.png',
  })).rejects.toThrow(/pathment\/badges/);
});


test('revoking an award retains XP and historical award record', async () => {
  const award = { update: jest.fn().mockResolvedValue({}) };
  models.UserBadge.findOne.mockResolvedValue(award);
  await game.revokeBadge('user', 'badge', 'Incorrect evidence');
  expect(award.update).toHaveBeenCalledWith(expect.objectContaining({ revokedAt: expect.any(Date), revokeReason: 'Incorrect evidence' }), { transaction });
  expect(models.PointsHistory.create).not.toHaveBeenCalled();
  expect(profile.update).not.toHaveBeenCalled();
  expect(models.AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'badge.revoked', newValues: expect.objectContaining({ xpPreserved: true, reawardBlocked: true }) }), { transaction });
});

test('badge progress matches award thresholds and hides nonmeasurable rules', () => {
  const mentee = { totalTasksCompleted: 3, currentStreakDays: 2, currentLevel: 2, totalPoints: 400 };
  expect(game.badgeProgress({ criteriaType: 'tasks_completed', criteriaValue: { count: 5 } }, mentee).label).toBe('3/5 approved tasks');
  expect(game.badgeProgress({ criteriaType: 'streak_days', criteriaValue: { days: 7 } }, mentee).label).toBe('2/7 day streak');
  expect(game.badgeProgress({ criteriaType: 'level_reached', criteriaValue: { level: 3 } }, mentee).label).toBe('Level 2/3');
  expect(game.badgeProgress({ criteriaType: 'custom', criteriaValue: { manual: true } }, mentee).measurable).toBe(false);
  expect(game.badgeProgress({ criteriaType: 'tasks_completed', criteriaValue: { count: 5 }, isSecret: true }, mentee).measurable).toBe(false);
});

test('badge catalog hides secrets until earned and attaches progress for locked auto badges', async () => {
  models.Badge.findAll.mockResolvedValue([
    { id: 'secret', name: 'Hidden', description: 'x', category: 'milestone', audience: 'mentee', criteriaType: 'tasks_completed', criteriaValue: { count: 1 }, pointsReward: 0, isSecret: true, isActive: true },
    { id: 'tasks', name: 'Quick Learner', description: '5 tasks', category: 'milestone', audience: 'mentee', criteriaType: 'tasks_completed', criteriaValue: { count: 5 }, pointsReward: 25, isSecret: false, isActive: true },
    { id: 'manual', name: 'Kudos', description: 'manual', category: 'achievement', audience: 'mentee', criteriaType: 'custom', criteriaValue: { manual: true }, pointsReward: 0, isSecret: false, isActive: true },
  ]);
  models.UserBadge.findAll.mockResolvedValue([]);
  profile.totalTasksCompleted = 3;
  const catalog = await game.getBadgeCatalog('user');
  expect(catalog.earned).toEqual([]);
  expect(catalog.available.map(b => b.id)).toEqual(['tasks', 'manual']);
  expect(catalog.available.find(b => b.id === 'tasks').progress.label).toBe('3/5 approved tasks');
  expect(catalog.available.find(b => b.id === 'manual').progress.measurable).toBe(false);
});

test('default badge seeding is org-scoped and idempotent', async () => {
  models.Badge.findOrCreate.mockResolvedValue([{ id: 'b1', toJSON: () => ({}) }, true]);
  models.Badge.count.mockResolvedValue(10);
  await game.createDefaultBadges({ transaction });
  expect(models.Badge.findOrCreate).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ organizationId: 'org-a' }),
    defaults: expect.objectContaining({ organizationId: 'org-a' }),
  }));
  const firstCalls = models.Badge.findOrCreate.mock.calls.length;
  models.Badge.findOrCreate.mockResolvedValue([{ id: 'b1', toJSON: () => ({}) }, false]);
  await game.createDefaultBadges({ transaction });
  expect(models.Badge.findOrCreate.mock.calls.length).toBeGreaterThan(firstCalls);
  expect(models.AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'badge.created' }), { transaction });
});

test('auto-award evaluation depth is bounded', async () => {
  const nested = jest.spyOn(game, 'checkAndAwardBadges');
  models.Badge.findAll.mockResolvedValue([
    { id: 'collector', name: 'Collector', isActive: true, retiredAt: null, audience: 'mentee', criteriaType: 'badges_earned', criteriaValue: { count: 1 } },
  ]);
  models.UserBadge.findAll.mockResolvedValue([]);
  models.UserBadge.count.mockResolvedValue(1);
  const awardSpy = jest.spyOn(game, 'awardBadge').mockImplementation(async () => {
    await game.checkAndAwardBadges('user');
    return { success: true };
  });
  await game.checkAndAwardBadges('user');
  expect(awardSpy.mock.calls.length).toBeLessThanOrEqual(2);
  awardSpy.mockRestore();
  nested.mockRestore();
});
