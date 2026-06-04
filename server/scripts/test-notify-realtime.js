/* Proves a task assignment fires a real-time 'notification:new' socket emit to
 * the mentee. Spies on socket.emitToUser. Run: node scripts/test-notify-realtime.js */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { models, sequelize } = require('../src/db');
const clanService = require('../src/services/clanService');
const taskService = require('../src/services/taskService');
const socket = require('../src/socket');

const TAG = `notif_${Date.now()}_`;
const e = (s) => (TAG + s + '@x.io').toLowerCase();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const created = { users: [], programs: [], clans: [], assigned: [], roadmapTasks: [] };

// Spy on the socket emit (the orchestrator destructures emitToUser from this module at call time).
const emitted = [];
socket.emitToUser = (userId, event, payload) => { emitted.push({ userId, event, payload }); };

async function mkUser(first, caps) {
  const u = await models.User.create({ email: e(first), passwordHash: 'x', role: caps[0], capabilities: caps, firstName: first, lastName: 'T', emailVerified: true, status: 'active' });
  created.users.push(u.id); return u;
}

(async () => {
  try {
    const admin = await mkUser('admin', ['admin']);
    const mentor = await mkUser('mentor', ['mentor']);
    const mentee = await mkUser('mentee', ['mentee']);
    const program = await models.Program.create({ createdBy: admin.id, name: TAG + 'prog', description: 'd', type: 'mentorship', totalDurationWeeks: 12, status: 'published', visibility: 'private' });
    created.programs.push(program.id);
    const clan = await clanService.createClan({ programId: program.id, name: TAG + 'clan', leadMentorId: mentor.id }, admin.id);
    created.clans.push(clan.id);
    await clanService.addMember(clan.id, { userId: mentee.id, role: 'mentee' });

    const task = await taskService.createCustomTask({ menteeId: mentee.id, title: 'Realtime check', type: 'project' }, mentor.id);
    created.assigned.push(task.id);
    created.roadmapTasks.push(task.roadmapTaskId);

    const hit = emitted.find((x) => x.event === 'notification:new' && x.userId === mentee.id);
    ok(emitted.length > 0, 'emitToUser was called during assignment');
    ok(Boolean(hit), "a 'notification:new' was emitted to the mentee");
    ok(hit && hit.payload?.type === 'task', 'the emitted payload is a task notification');
    ok(hit && /assigned/i.test(hit.payload?.title || ''), 'payload carries the assignment title');

    // Confirm the DB row exists too (so it shows on reload as well).
    const row = await models.Notification.findOne({ where: { userId: mentee.id, type: 'task' }, order: [['created_at', 'DESC']] });
    ok(Boolean(row), 'a Notification row was persisted (shows on reload)');

    console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  } catch (err) {
    console.error('FATAL', err.message, err.stack);
    fail++;
  } finally {
    try {
      await models.Notification.destroy({ where: { userId: created.users } }).catch(() => {});
      await models.AssignedTask.destroy({ where: { id: created.assigned } }).catch(() => {});
      await models.RoadmapTask.destroy({ where: { id: created.roadmapTasks } }).catch(() => {});
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
