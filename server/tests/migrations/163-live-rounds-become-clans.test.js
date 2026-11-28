'use strict';

/**
 * Migration 163 moves a live selection round off `candidate_pools` and onto a
 * clan, with its people, its work and everything they have already done.
 *
 * The two live rounds have no roadmaps and no durations — their work items are
 * standalone `roadmap_tasks` rows with a fixed calendar date — so the
 * migration has to invent both, and what it invents is what these pin:
 *
 *   - a roadmap per level, adopting that level's existing steps rather than
 *     copying them, so every task already assigned keeps pointing at the same
 *     step and nobody's work is orphaned;
 *   - a duration per step taken from the span the work item originally
 *     allowed (its due date minus when it was added), because a round counts a
 *     deadline from the moment somebody joins and candidates arrive one at a
 *     time.
 *
 * And the part that has to be exactly right: a candidate's assigned tasks move
 * from `pool_member_id` to `clan_id` without losing a row, and the rollback
 * puts every one of them back.
 */

const { models } = require('../../src/db');
const migration = require('../../scripts/migrations/163_live_rounds_become_clans');
const { cleanDb, createAdmin, createUser, createProgram } = require('../helpers/seed');

const PoolTask = () => models.AssignedTask.scope('withPoolWork');

describe('migration 163: live rounds become clans', () => {
  let admin, program, cohort, pool, ada, ben, steps;

  /** A standalone step, exactly as the pool's "add a course" flow makes one. */
  const standaloneStep = (title, difficulty = 'medium') => models.RoadmapTask.create({
    title, description: title, type: 'course', difficulty, taskOrder: 1, deliverable: 'Finish the course',
  }, { validate: false });

  const workItem = (step, level, { days = 8, cancelled = false } = {}) => ({
    id: `${step.id}-item`,
    kind: 'course',
    title: step.title,
    roadmapTaskId: step.id,
    levels: level ? [level] : [],
    forEveryone: false,
    points: 10,
    required: true,
    createdAt: new Date('2026-11-01').toISOString(),
    dueAt: new Date(Date.parse('2026-11-01') + days * 86400000).toISOString(),
    cancelledAt: cancelled ? new Date('2026-11-05').toISOString() : null,
  });

  beforeEach(async () => {
    await cleanDb();
    admin = await createAdmin({ email: 'm163-admin@test.com' });
    program = await createProgram({ createdBy: admin.id, name: 'Fellowship' });
    cohort = await models.Cohort.create({
      programId: program.id, name: '2027 intake', status: 'open', levels: [], intakeFormSchema: [],
    });

    steps = {
      one: await standaloneStep('Level 1 Foundations'),
      two: await standaloneStep('Level 2 Portfolio', 'hard'),
      gone: await standaloneStep('Withdrawn course'),
    };

    pool = await models.CandidatePool.create({
      programId: program.id, cohortId: cohort.id, name: 'Spring pool', status: 'open',
      selectionQuota: 3, createdById: admin.id,
      qualificationDueAt: new Date('2026-12-20'),
      scoringPolicy: { difficultyPoints: { easy: 5, medium: 10, hard: 25, expert: 40 } },
      settings: { waitlistSize: 2 },
      workItems: [
        workItem(steps.one, 'level-1', { days: 8 }),
        workItem(steps.two, 'level-2', { days: 21 }),
        workItem(steps.gone, 'level-1', { cancelled: true }),
      ],
    }, { validate: false });

    ada = await createUser({ role: 'mentee', email: 'ada163@test.com' });
    ben = await createUser({ role: 'mentee', email: 'ben163@test.com' });
    await models.MenteeProfile.destroy({ where: { userId: [ada.id, ben.id] } });

    const members = await Promise.all([
      models.PoolMember.create({ poolId: pool.id, userId: ada.id, email: 'ada163@test.com', level: 'level-1', status: 'active' }),
      models.PoolMember.create({ poolId: pool.id, userId: ben.id, email: 'ben163@test.com', level: 'level-2', status: 'active' }),
      // Invited, never registered: no account to put in a clan.
      models.PoolMember.create({ poolId: pool.id, userId: null, email: 'nobody163@test.com', level: 'level-1', status: 'invited' }),
    ]);

    await models.AssignedTask.create({
      menteeId: ada.id, mentorId: admin.id, roadmapTaskId: steps.one.id, poolMemberId: members[0].id,
      status: 'in_progress', assignedAt: new Date('2026-11-02'), dueDate: new Date('2026-11-09'),
    }, { validate: false });
    await models.AssignedTask.create({
      menteeId: ben.id, mentorId: admin.id, roadmapTaskId: steps.two.id, poolMemberId: members[1].id,
      status: 'submitted', assignedAt: new Date('2026-11-02'), dueDate: new Date('2026-11-22'),
    }, { validate: false });
  });

  it('moves the round, its people and their work onto a clan', async () => {
    await migration.up();

    const clan = await models.Clan.findOne({ where: { programId: program.id, kind: 'pool' } });
    expect(clan).toBeTruthy();
    expect(clan.name).toBe('Spring pool');
    // The terms come across, in the shape a round reads them.
    expect(clan.selectionSettings).toMatchObject({ quota: 3, waitlistSize: 2 });
    expect(clan.selectionSettings.scoringPolicy.difficultyPoints.hard).toBe(25);

    // The intake points at it, which is what feeds new applicants in.
    expect((await cohort.reload()).poolClanId).toBe(clan.id);

    // One rule per level that had live work. The withdrawn piece is history
    // and must not be handed to anybody again.
    const rules = clan.levelRules;
    expect(rules.map((r) => r.level).sort()).toEqual(['level-1', 'level-2']);

    const roadmaps = await models.Roadmap.findAll({ where: { id: rules.map((r) => r.roadmapId) } });
    expect(roadmaps).toHaveLength(2);

    // The steps were ADOPTED, not copied: the same rows, so the work already
    // assigned from them still points at them.
    const levelOne = rules.find((r) => r.level === 'level-1');
    const adopted = await models.RoadmapTask.findByPk(steps.one.id);
    expect(adopted.roadmapId).toBe(levelOne.roadmapId);
    // And it now says how long it is meant to take, counted from joining.
    expect(adopted.dueOffsetDays).toBe(8);
    expect((await models.RoadmapTask.findByPk(steps.two.id)).dueOffsetDays).toBe(21);
    // The withdrawn piece stays outside every roadmap.
    expect((await models.RoadmapTask.findByPk(steps.gone.id)).roadmapId).toBeNull();
  });

  it('seats everyone who has an account, at the level they hold', async () => {
    await migration.up();
    const clan = await models.Clan.findOne({ where: { programId: program.id, kind: 'pool' } });

    const memberships = await models.ClanMembership.findAll({ where: { clanId: clan.id } });
    expect(memberships).toHaveLength(2);
    expect(memberships.find((m) => m.userId === ada.id).level).toBe('level-1');
    expect(memberships.find((m) => m.userId === ben.id).level).toBe('level-2');

    // A candidate is not a mentee of the programme, so none of this enrols them.
    expect(await models.Enrollment.count({ where: { menteeId: [ada.id, ben.id] } })).toBe(0);

    // Every selection record points at the round — including the one with no
    // account, who is still in the running and must still be listed.
    const records = await models.PoolMember.findAll({ where: { poolId: pool.id } });
    expect(records.every((r) => r.clanId === clan.id)).toBe(true);
    expect(records.find((r) => r.userId === ada.id).clanMembershipId)
      .toBe(memberships.find((m) => m.userId === ada.id).id);
    expect(records.find((r) => r.userId === null).clanMembershipId).toBeNull();
  });

  it('carries every piece of work across, with its status and its date', async () => {
    const before = await PoolTask().findAll({ order: [['menteeId', 'ASC']] });
    await migration.up();
    const clan = await models.Clan.findOne({ where: { programId: program.id, kind: 'pool' } });

    const after = await PoolTask().findAll({ where: { clanId: clan.id } });
    expect(after).toHaveLength(before.length);
    expect(after.every((t) => t.poolMemberId === null)).toBe(true);

    const adas = after.find((t) => t.menteeId === ada.id);
    expect(adas.status).toBe('in_progress');
    // The date they were given does not move: only new joiners take the offset.
    expect(new Date(adas.dueDate).toISOString().slice(0, 10)).toBe('2026-11-09');
  });

  it('is safe to run twice', async () => {
    await migration.up();
    await migration.up();

    expect(await models.Clan.count({ where: { programId: program.id, kind: 'pool' } })).toBe(1);
    expect(await models.ClanMembership.count({ where: { userId: [ada.id, ben.id] } })).toBe(2);
  });

  it('writes nothing on a dry run', async () => {
    await migration.up({ dryRun: true });

    expect(await models.Clan.count({ where: { kind: 'pool' } })).toBe(0);
    expect(await models.PoolMember.count({ where: { clanId: { [require('sequelize').Op.ne]: null } } })).toBe(0);
    expect((await models.RoadmapTask.findByPk(steps.one.id)).roadmapId).toBeNull();
  });

  it('puts everything back', async () => {
    await migration.up();
    await migration.down();

    expect(await models.Clan.count({ where: { kind: 'pool' } })).toBe(0);
    expect(await models.ClanMembership.count({ where: { userId: [ada.id, ben.id] } })).toBe(0);
    expect((await cohort.reload()).poolClanId).toBeNull();
    expect((await models.RoadmapTask.findByPk(steps.one.id)).roadmapId).toBeNull();

    const records = await models.PoolMember.findAll({ where: { poolId: pool.id } });
    expect(records.every((r) => r.clanId === null && r.clanMembershipId === null)).toBe(true);

    // Every task is back on its selection record, none lost, none duplicated.
    const back = await PoolTask().findAll();
    expect(back).toHaveLength(2);
    expect(back.every((t) => t.poolMemberId !== null && t.clanId === null)).toBe(true);
  });
});
