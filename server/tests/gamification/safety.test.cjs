const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const withPostgres = require('../helpers/privatePostgres.cjs');

test('gamification migration, isolation and concurrent awards/redemptions', { timeout: 180000 }, async t => {
  await withPostgres(async privateDb => {
    // A fresh cluster owned by this test. Never read .env or a configured database.
    Object.assign(process.env, { NODE_ENV: 'test', DB_SSL: 'false',
      DATABASE_URL: `postgres://isolation_test@127.0.0.1:${privateDb.config.port}/postgres?host=${encodeURIComponent(privateDb.config.host)}`,
      MULTI_TENANT_WORKSPACES_ENABLED: 'false', DEFAULT_ORGANIZATION_SLUG: 'devweekends',
      JWT_SECRET: 'gamification-isolation-only', JWT_REFRESH_SECRET: 'gamification-refresh-only' });
    require.cache[require.resolve('../../src/services/notificationOrchestrator')] = { exports: { dispatch: async () => ({ delivered: 0 }) } };
    const { models, sequelize } = require('../../src/db');
    assert.equal(sequelize.config.host, privateDb.config.host);
    assert.equal(Number(sequelize.config.port), Number(privateDb.config.port));
    const { runWithRequestContext } = require('../../src/utils/auditContext');
    const game = require('../../src/services/gamificationService');
    const rewards = require('../../src/services/rewardsService');
    try {
      await sequelize.sync();
      const org = await models.Organization.create({ name: 'Primary', slug: 'devweekends' });
      const other = await models.Organization.create({ name: 'Other', slug: 'other' });
      const createUser = (name, role) => models.User.create({ firstName: name, lastName: 'Test',
        email: `${name}@example.test`, passwordHash: 'not-used', role, status: 'active', emailVerified: true });
      const admin = await createUser('admin', 'admin');
      const mentee = await createUser('mentee', 'mentee');
      const mentee2 = await createUser('mentee2', 'mentee');
      const mentor = await createUser('mentor', 'mentor');
      const inOrg = fn => runWithRequestContext({ organizationId: org.id, userId: admin.id }, fn);
      const inOther = fn => runWithRequestContext({ organizationId: other.id, userId: admin.id }, fn);
      await models.OrganizationMembership.bulkCreate([admin, mentee].map(user => ({ organizationId: other.id, userId: user.id, status: 'active', role: user.id === admin.id ? 'admin' : 'member' })));
      let profile, program, enrollment;
      await inOrg(async () => {
        profile = await models.MenteeProfile.create({ userId: mentee.id, totalPoints: 600, currentLevel: 2 });
        await models.MenteeProfile.create({ userId: mentee2.id });
        await models.MentorProfile.create({ userId: mentor.id });
        program = await models.Program.create({ name: 'Program', description: 'Test', type: 'mentorship', createdBy: admin.id, totalDurationWeeks: 4 });
        enrollment = await models.Enrollment.create({ menteeId: mentee.id, programId: program.id, status: 'active', totalPointsEarned: 100 });
        await models.Enrollment.create({ menteeId: mentee2.id, programId: program.id, status: 'active', totalPointsEarned: 100 });
      });
      await inOther(() => models.MenteeProfile.create({ userId: mentee.id, totalPoints: 7 }));
      process.env.MULTI_TENANT_WORKSPACES_ENABLED = 'true';

      await t.test('additive migration preserves legacy duplicate events, awards, credits and XP', async () => {
        const event = randomUUID();
        let legacyAward;
        await inOrg(async () => {
          await models.PointsHistory.bulkCreate([1, 2].map(() => ({ userId: mentee.id, sourceType: 'task_completed', sourceId: event, pointsBefore: 580, pointsAfter: 590, pointsChange: 10 })));
          const legacyBadge = await models.Badge.create({ name: 'Legacy award', description: 'Keep historical recognition', category: 'milestone', criteriaType: 'custom', criteriaValue: { manual: true }, isActive: false });
          legacyAward = await models.UserBadge.create({ userId: mentee2.id, badgeId: legacyBadge.id });
        });
        // Reconstruct only the columns this migration adds, on this disposable DB.
        await sequelize.query('ALTER TABLE points_history DROP COLUMN event_key; ALTER TABLE redemptions DROP COLUMN request_key; ALTER TABLE badges DROP COLUMN audience, DROP COLUMN retired_at; ALTER TABLE user_badges DROP COLUMN revoked_at, DROP COLUMN revoke_reason');
        const { up } = require('../../scripts/migrations/115_gamification_safety');
        await up({ db: sequelize }); await up({ db: sequelize });
        await inOrg(async () => {
          assert.equal((await profile.reload()).totalPoints, 600);
          assert.equal((await rewards.menteePointsBalance(mentee.id)).balance, 100);
          assert.equal(await models.PointsHistory.count(), 2);
          assert.ok(await models.UserBadge.findByPk(legacyAward.id));
          assert.equal((await game.awardPoints(mentee.id, 10, 'task_completed', event)).pointsAwarded, 0);
          assert.equal((await profile.reload()).currentLevel, 2);
        });
      });

      await t.test('simultaneous duplicate and independent events do not double award or lose XP', () => inOrg(async () => {
        const event = randomUUID();
        await Promise.all(Array.from({ length: 10 }, () => game.awardPoints(mentee.id, 10, 'task_completed', event)));
        assert.equal((await profile.reload()).totalPoints, 610);
        assert.equal(await models.PointsHistory.count({ where: { sourceId: event } }), 1);
        await Promise.all(Array.from({ length: 6 }, () => game.awardPoints(mentee.id, 5, 'task_completed', randomUUID())));
        assert.equal((await profile.reload()).totalPoints, 640);
        assert.equal((await rewards.menteePointsBalance(mentee.id)).balance, 100, 'bonus XP is never spendable credit');
      }));

      let badge;
      await t.test('badge award, XP, counters and audit commit once and rules freeze after earning', () => inOrg(async () => {
        badge = await game.saveBadge(null, { name: 'Recognition', description: 'Verified support', category: 'achievement', criteriaType: 'custom', criteriaValue: { manual: true }, pointsReward: 50, isActive: true });
        await Promise.all(Array.from({ length: 5 }, () => game.awardBadge(mentee.id, badge.id, { reason: 'Verified contribution', awardedBy: admin.id })));
        assert.equal((await profile.reload()).totalPoints, 690);
        assert.equal(await models.UserBadge.count({ where: { badgeId: badge.id } }), 1);
        assert.equal((await badge.reload()).totalUnlocked, 1);
        assert.equal(await models.AuditLog.count({ where: { action: 'badge.awarded', entityId: badge.id } }), 1);
        await assert.rejects(game.saveBadge(badge.id, { pointsReward: 900 }), /earned badge/);
        await game.revokeBadge(mentee.id, badge.id, 'Evidence was incorrect');
        assert.equal((await game.getUserBadges(mentee.id)).length, 0);
        await assert.rejects(game.awardBadge(mentee.id, badge.id), /cannot be awarded again/);
        assert.equal((await profile.reload()).totalPoints, 690);
      }));

      await t.test('audit failure rolls back the badge, its counters and XP', () => inOrg(async () => {
        const b = await game.saveBadge(null, { name: 'Atomic', description: 'Atomic award', category: 'achievement', criteriaType: 'custom', criteriaValue: { manual: true }, pointsReward: 10, isActive: true });
        models.AuditLog.addHook('beforeCreate', 'fail-award-audit', () => { throw new Error('Audit unavailable'); });
        try { await assert.rejects(game.awardBadge(mentee.id, b.id), /Audit unavailable/); }
        finally { models.AuditLog.removeHook('beforeCreate', 'fail-award-audit'); }
        assert.equal((await profile.reload()).totalPoints, 690);
        assert.equal(await models.UserBadge.count({ where: { badgeId: b.id } }), 0);
        assert.equal((await b.reload()).totalUnlocked, 0);
      }));

      let gift;
      await t.test('concurrent redemption cannot overspend and retried request returns original redemption', () => inOrg(async () => {
        gift = await rewards.createGift({ name: 'Reward', costXp: 75, stock: 4 }, admin.id);
        const keys = [randomUUID(), randomUUID()];
        const results = await Promise.allSettled(keys.map(key => rewards.redeem(gift.id, mentee.id, admin.id, key)));
        assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
        const winner = results.findIndex(r => r.status === 'fulfilled');
        const repeated = await rewards.redeem(gift.id, mentee.id, admin.id, keys[winner]);
        assert.equal(repeated.id, results[winner].value.id);
        assert.equal((await rewards.menteePointsBalance(mentee.id)).balance, 25);
        assert.equal((await gift.reload()).stock, 3);
        assert.equal((await profile.reload()).totalPoints, 690);
        await assert.rejects(rewards.createGift({ name: 'Invalid', costXp: -1 }, admin.id), /whole numbers/);
      }));

      await t.test('two members cannot redeem the final stock item', () => inOrg(async () => {
        const last = await rewards.createGift({ name: 'Last item', costXp: 1, stock: 1 }, admin.id);
        const results = await Promise.allSettled([mentee.id, mentee2.id].map(id => rewards.redeem(last.id, id, admin.id, randomUUID())));
        assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
        assert.equal((await last.reload()).stock, 0);
      }));

      await t.test('same account has isolated XP, catalogs and award history across organizations', () => inOther(async () => {
        assert.equal(await models.Badge.count(), 0);
        assert.equal(await models.Gift.count(), 0);
        assert.equal(await models.PointsHistory.count(), 0);
        assert.equal(await models.UserBadge.count(), 0);
        assert.equal((await rewards.menteePointsBalance(mentee.id)).balance, 0);
        await assert.rejects(game.awardBadge(mentee.id, badge.id), /not found/);
        await assert.rejects(rewards.redeem(gift.id, mentee.id, admin.id), /not available/);
        await assert.rejects(game.saveBadge(badge.id, { isActive: false }), /not found/);
        await game.awardPoints(mentee.id, 3, 'task_completed', randomUUID());
        assert.equal((await models.MenteeProfile.findOne({ where: { userId: mentee.id } })).totalPoints, 10);
      }));

      await t.test('mentor recognition uses evidence, bounded accepted-answer XP and no login or kudos farming', () => inOrg(async () => {
        await game.awardPoints(mentor.id, 15, 'community_kudos', randomUUID());
        await game.awardDailyLoginPoint(mentor.id);
        assert.equal(await models.PointsHistory.count({ where: { userId: mentor.id } }), 0);
        await Promise.all(Array.from({ length: 6 }, () => game.awardPoints(mentor.id, 25, 'community_answer', randomUUID())));
        assert.equal((await game.getUserGamificationStats(mentor.id)).totalPoints, 100);
        const b = await game.saveBadge(null, { name: 'Helpful Mentor', description: 'Actionable feedback', category: 'mentor', audience: 'mentor', criteriaType: 'custom', criteriaValue: { manual: true }, pointsReward: 50, isActive: true });
        await assert.rejects(game.awardBadge(mentor.id, b.id), /supporting evidence/);
        await assert.rejects(game.awardBadge(mentor.id, b.id, { awardedBy: mentor.id, reason: 'I am very helpful' }), /Another administrator/);
        await game.awardBadge(mentor.id, b.id, { awardedBy: admin.id, reason: 'Mentee verified actionable feedback' });
        assert.equal((await game.getUserGamificationStats(mentor.id)).totalPoints, 150);
      }));

      await t.test('program and badge criteria use actual records; empty daily logs and login do not earn XP', () => inOrg(async () => {
        await enrollment.update({ status: 'program_completed' });
        assert.equal(await game.checkBadgeCriteria(mentee.id, { criteriaType: 'programs_completed', criteriaValue: { count: 1 } }), true);
        assert.equal(await game.checkBadgeCriteria(mentee.id, { criteriaType: 'badges_earned', criteriaValue: { count: 1 } }), false, 'revoked award is excluded');
        const today = new Date().toISOString().slice(0, 10);
        const log = await models.DailyLogEntry.create({ menteeId: mentee.id, dateKey: today });
        await game.updateStreak(mentee.id); await game.awardDailyLoginPoint(mentee.id);
        assert.equal(await models.PointsHistory.count({ where: { sourceType: 'daily_activity' } }), 0);
        await log.update({ note: 'Implemented and tested my task' });
        await Promise.all([game.updateStreak(mentee.id), game.updateStreak(mentee.id)]);
        assert.equal(await models.PointsHistory.count({ where: { sourceType: 'daily_activity' } }), 1);
      }));

      await t.test('badge catalog respects secrets, progress, and org-scoped default seeding', () => inOrg(async () => {
        await profile.update({ totalTasksCompleted: 3, currentStreakDays: 2, currentLevel: 2 });
        const secret = await game.saveBadge(null, { name: 'Secret Spark', description: 'Hidden until earned', category: 'milestone', criteriaType: 'tasks_completed', criteriaValue: { count: 1 }, pointsReward: 0, isActive: true, isSecret: true });
        const quick = await game.saveBadge(null, { name: 'Catalog Quick', description: '5 tasks', category: 'milestone', criteriaType: 'tasks_completed', criteriaValue: { count: 5 }, pointsReward: 0, isActive: true });
        const catalog = await game.getBadgeCatalog(mentee.id);
        assert.equal(catalog.available.some(b => b.id === secret.id), false);
        const progressBadge = catalog.available.find(b => b.id === quick.id);
        assert.equal(progressBadge.progress.label, '3/5 approved tasks');
        const first = await game.createDefaultBadges();
        const second = await game.createDefaultBadges();
        assert.equal(first.total, second.total);
        assert.equal(second.created, 0);
        assert.equal(await models.Badge.count({ where: { name: 'First Steps' } }), 1);
      }));
    } finally { await sequelize.close(); }
  });
});
