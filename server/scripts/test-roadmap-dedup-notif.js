/* Verifies: roadmap getAssignees, idempotent re-assign (no dup tasks/progress),
 * and that task notifications carry the mentor's name + are specific.
 * Run: node scripts/test-roadmap-dedup-notif.js  (self-cleans) */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { models, sequelize } = require('../src/db');
const clanService = require('../src/services/clanService');
const taskService = require('../src/services/taskService');
const linearRoadmapService = require('../src/services/linearRoadmapService');

const TAG = `rd_${Date.now()}_`;
const e = (s) => (TAG + s + '@x.io').toLowerCase();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const created = { users: [], programs: [], clans: [], roadmaps: [] };

async function mkUser(first, caps) {
  const u = await models.User.create({ email: e(first), passwordHash: 'x', role: caps[0], capabilities: caps, firstName: first, lastName: 'T', emailVerified: true, status: 'active' });
  created.users.push(u.id); return u;
}

(async () => {
  try {
    const admin = await mkUser('admin', ['admin']);
    const mentor = await mkUser('Dana', ['mentor']); // first name shows up in notifications
    const mentee = await mkUser('mentee', ['mentee']);
    const program = await models.Program.create({ createdBy: admin.id, name: TAG + 'prog', description: 'd', type: 'mentorship', totalDurationWeeks: 12, status: 'published', visibility: 'private' });
    created.programs.push(program.id);
    const clan = await clanService.createClan({ programId: program.id, name: TAG + 'clan', leadMentorId: mentor.id }, admin.id);
    created.clans.push(clan.id);
    await clanService.addMember(clan.id, { userId: mentee.id, role: 'mentee' });

    const roadmap = await linearRoadmapService.createRoadmap(mentor.id, {
      name: TAG + 'rm', programId: program.id, steps: [
        { title: 'Step one', type: 'project' },
        { title: 'Step two', type: 'project' },
      ]
    });
    created.roadmaps.push(roadmap.id);

    // Before assignment: nobody has it.
    let assignees = await linearRoadmapService.getAssignees(roadmap.id);
    ok(assignees.length === 0, 'getAssignees empty before assignment');

    // Assign.
    await linearRoadmapService.assignToMentee(mentor.id, roadmap.id, mentee.id, 0);
    assignees = await linearRoadmapService.getAssignees(roadmap.id);
    ok(assignees.includes(mentee.id), 'getAssignees includes the mentee after assignment');

    const progCount1 = await models.RoadmapProgress.count({ where: { roadmapId: roadmap.id, menteeId: mentee.id } });
    const steps = await linearRoadmapService.getSteps(roadmap.id);
    const taskCount1 = await models.AssignedTask.count({ where: { roadmapTaskId: steps[0].id, menteeId: mentee.id } });
    ok(progCount1 === 1 && taskCount1 === 1, 'one RoadmapProgress + one AssignedTask for step 1');

    // Re-assign the same roadmap → idempotent (no duplicates).
    await linearRoadmapService.assignToMentee(mentor.id, roadmap.id, mentee.id, 0);
    const progCount2 = await models.RoadmapProgress.count({ where: { roadmapId: roadmap.id, menteeId: mentee.id } });
    const taskCount2 = await models.AssignedTask.count({ where: { roadmapTaskId: steps[0].id, menteeId: mentee.id } });
    ok(progCount2 === 1, 're-assign does NOT create a 2nd RoadmapProgress');
    ok(taskCount2 === 1, 're-assign does NOT create a 2nd AssignedTask');

    // Notification is specific + carries the mentor's first name.
    const notif = await models.Notification.findOne({ where: { userId: mentee.id, type: 'task' }, order: [['created_at', 'DESC']] });
    ok(Boolean(notif), 'a task notification was created for the mentee');
    ok(notif && /Dana/.test(notif.title), `notification title names the mentor (got: "${notif?.title}")`);
    ok(notif && /Step one/.test(notif.message), `notification message names the step (got: "${notif?.message}")`);

    // Custom task notification names the mentor too.
    await taskService.createCustomTask({ menteeId: mentee.id, title: 'Hand-rolled task', type: 'project' }, mentor.id);
    const custom = await models.Notification.findOne({ where: { userId: mentee.id, type: 'task' }, order: [['created_at', 'DESC']] });
    ok(custom && /Dana/.test(custom.title), `custom-task notification names the mentor (got: "${custom?.title}")`);
    ok(custom && /Hand-rolled task/.test(custom.message), 'custom-task notification names the task');

    console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  } catch (err) {
    console.error('FATAL', err.message, err.stack);
    fail++;
  } finally {
    try {
      await models.Notification.destroy({ where: { userId: created.users } }).catch(() => {});
      await models.AssignedTask.destroy({ where: { menteeId: created.users } }).catch(() => {});
      await models.RoadmapProgress.destroy({ where: { roadmapId: created.roadmaps } }).catch(() => {});
      await models.RoadmapTask.destroy({ where: { roadmapId: created.roadmaps } }).catch(() => {});
      await models.Roadmap.destroy({ where: { id: created.roadmaps } }).catch(() => {});
      const rts = await models.RoadmapTask.findAll({ include: [{ model: models.Roadmap, as: 'roadmap', where: { programId: created.programs }, required: true }] }).catch(() => []);
      await models.RoadmapTask.destroy({ where: { id: rts.map((r) => r.id) } }).catch(() => {});
      await models.ClanMembership.destroy({ where: { clanId: created.clans } }).catch(() => {});
      await models.Enrollment.destroy({ where: { menteeId: created.users } }).catch(() => {});
      await models.Clan.destroy({ where: { id: created.clans } }).catch(() => {});
      await models.Program.destroy({ where: { id: created.programs } }).catch(() => {});
      await models.User.destroy({ where: { id: created.users } }).catch(() => {});
      console.log('cleanup done');
    } catch (e2) { console.error('cleanup error', e2.message); }
    await sequelize.close();
    process.exit(fail ? 1 : 0);
  }
})();
