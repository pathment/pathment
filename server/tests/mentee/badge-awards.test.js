'use strict';

const { models } = require('../../src/db');
const gamificationService = require('../../src/services/gamificationService');
const clanService = require('../../src/services/clanService');
const {
  cleanDb,
  createAdmin,
  createMentor,
  createMentee,
  createProgram,
} = require('../helpers/seed');

describe('badge award consistency', () => {
  beforeEach(cleanDb);

  it('awards a badge, its XP, and counters exactly once under concurrency', async () => {
    const mentee = await createMentee({ email: 'badge-once@test.com' });
    const badge = await models.Badge.create({
      name: 'Concurrency proof',
      description: 'Awarded only once even when two checks race.',
      category: 'milestone',
      criteriaType: 'custom',
      criteriaValue: { targetRole: 'mentee' },
      pointsReward: 25,
      earningScope: 0,
    });

    const results = await Promise.all([
      gamificationService.awardBadge(mentee.id, badge.id),
      gamificationService.awardBadge(mentee.id, badge.id),
    ]);

    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(await models.UserBadge.count({ where: { userId: mentee.id, badgeId: badge.id } })).toBe(1);
    expect(await models.PointsHistory.count({
      where: { userId: mentee.id, sourceType: 'badge_earned' },
    })).toBe(1);

    await badge.reload();
    const profile = await models.MenteeProfile.findOne({ where: { userId: mentee.id } });
    expect(Number(profile.totalPoints)).toBe(25);
    expect(Number(profile.totalBadgesEarned)).toBe(1);
    expect(Number(badge.totalUnlocked)).toBe(1);
  });

  it('allows final program badge reconciliation after the program closes', async () => {
    const admin = await createAdmin({ email: 'badge-admin@test.com' });
    const mentee = await createMentee({ email: 'closed-program-badge@test.com' });
    const program = await createProgram({ createdBy: admin.id });
    await program.update({ closedAt: new Date(), status: 'completed' });
    const badge = await models.Badge.create({
      name: 'Program finisher',
      description: 'Recognizes completed work during final reconciliation.',
      category: 'completion',
      criteriaType: 'tasks_completed',
      criteriaValue: { count: 1, targetRole: 'mentee' },
      pointsReward: 0,
      earningScope: 1,
    });

    const result = await gamificationService.awardBadge(mentee.id, badge.id, {
      programId: program.id,
      reason: 'final reconciliation',
    });

    expect(result.success).toBe(true);
    expect(result.badge.programId).toBe(program.id);
  });

  it('reconciles roster-based mentor badges after membership commits', async () => {
    const admin = await createAdmin({ email: 'roster-admin@test.com' });
    const mentor = await createMentor({ email: 'roster-mentor@test.com' });
    const mentee = await createMentee({ email: 'roster-mentee@test.com' });
    const program = await createProgram({ createdBy: admin.id });
    const clan = await models.Clan.create({
      programId: program.id,
      name: 'Badge roster clan',
      leadMentorId: mentor.id,
      createdBy: admin.id,
    });
    const badge = await models.Badge.create({
      name: 'First mentee guided',
      description: 'Guide one mentee.',
      category: 'mentoring',
      criteriaType: 'mentees_guided',
      criteriaValue: { count: 1, targetRole: 'mentor' },
      pointsReward: 0,
      earningScope: 0,
    });

    await clanService.addMember(clan.id, { userId: mentor.id, role: 'lead_mentor' });
    expect(await models.UserBadge.count({ where: { userId: mentor.id, badgeId: badge.id } })).toBe(0);

    await clanService.addMember(clan.id, { userId: mentee.id, role: 'mentee' });

    expect(await models.UserBadge.count({ where: { userId: mentor.id, badgeId: badge.id } })).toBe(1);
  });
});
