'use strict';

/**
 * A paused mentee gets each win-back reminder once. Regression: the job loaded
 * memberships without organization_id, so saving the next stage was refused
 * as an "ownership change" — after the reminder had gone out — and every
 * hourly run sent it again (25 emails a day per paused mentee).
 */
const { models } = require('../../src/db');
const seed = require('../helpers/seed');
const pauseService = require('../../src/services/mentorshipPauseService');
const { forEachWorkspace } = require('../../src/utils/workspaceExecution');

const DAY = 24 * 60 * 60 * 1000;

beforeEach(async () => { await seed.cleanDb(); });

it('sends a win-back reminder once per stage, run after run', async () => {
  const admin = await seed.createAdmin();
  const mentor = await seed.createMentor({ email: 'mentor-re@example.com' });
  const mentee = await seed.createMentee({ email: 'paused-re@example.com', firstName: 'Pat' });
  const program = await seed.createProgram({ createdBy: admin.id });
  const clan = await seed.createClan({ programId: program.id, createdBy: admin.id, leadMentor: mentor, mentees: [mentee] });
  await models.ClanMembership.update(
    { status: 'paused', pausedAt: new Date(Date.now() - 3 * DAY), pausedBy: 'auto', reengageStage: 0, reengageCount: 0 },
    { where: { clanId: clan.id, userId: mentee.id } },
  );
  const orchestrator = require('../../src/services/notificationOrchestrator');
  const dispatch = jest.spyOn(orchestrator, 'dispatch').mockResolvedValue({});

  // Three scheduler runs (hourly in production), the way the scheduler calls it.
  for (let i = 0; i < 3; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await forEachWorkspace(() => pauseService.runReengagement());
  }

  const m = await models.ClanMembership.findOne({ where: { clanId: clan.id, userId: mentee.id } });
  expect(m.reengageStage).toBe(1);
  expect(m.reengageCount).toBe(1);
  const sent = dispatch.mock.calls.filter(([arg]) => arg.eventKey === 'mentee_reengage');
  expect(sent).toHaveLength(1);
  dispatch.mockRestore();
});

it('sends one reminder when several stages are overdue, not one per run', async () => {
  const admin = await seed.createAdmin();
  const mentor = await seed.createMentor({ email: 'mentor-re2@example.com' });
  const mentee = await seed.createMentee({ email: 'paused-re2@example.com' });
  const program = await seed.createProgram({ createdBy: admin.id });
  const clan = await seed.createClan({ programId: program.id, createdBy: admin.id, leadMentor: mentor, mentees: [mentee] });
  // Paused 12 days ago, never reminded: the 2-, 5- and 10-day stages are all due.
  await models.ClanMembership.update(
    { status: 'paused', pausedAt: new Date(Date.now() - 12 * DAY), pausedBy: 'auto', reengageStage: 0, reengageCount: 0 },
    { where: { clanId: clan.id, userId: mentee.id } },
  );
  const orchestrator = require('../../src/services/notificationOrchestrator');
  const dispatch = jest.spyOn(orchestrator, 'dispatch').mockResolvedValue({});
  for (let i = 0; i < 4; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await forEachWorkspace(() => pauseService.runReengagement());
  }
  const m = await models.ClanMembership.findOne({ where: { clanId: clan.id, userId: mentee.id } });
  expect(m.reengageStage).toBe(3); // next: the 21-day stage
  expect(dispatch.mock.calls.filter(([a]) => a.eventKey === 'mentee_reengage')).toHaveLength(1);
  dispatch.mockRestore();
});
