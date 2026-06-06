/* "Apply slot to all": configure one slot, push it to every mentee the mentor
 * assigned the schedule to. Self-cleaning. Run: node scripts/test-schedule-applyall.js */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { models, sequelize } = require('../src/db');
const svc = require('../src/services/scheduleTemplateService');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const TAG = `sched_${Date.now()}_`;
const ids = [];

(async () => {
  try {
    const mentor = await models.User.create({ email: `${TAG}m@x.io`, passwordHash: 'x', role: 'mentor', capabilities: ['mentor'], firstName: 'M', lastName: 'T', emailVerified: true, status: 'active' });
    const a = await models.User.create({ email: `${TAG}a@x.io`, passwordHash: 'x', role: 'mentee', capabilities: ['mentee'], firstName: 'A', lastName: 'T', emailVerified: true, status: 'active' });
    const b = await models.User.create({ email: `${TAG}b@x.io`, passwordHash: 'x', role: 'mentee', capabilities: ['mentee'], firstName: 'B', lastName: 'T', emailVerified: true, status: 'active' });
    ids.push(mentor.id, a.id, b.id);

    const tpl = await svc.createTemplate(mentor.id, { name: `${TAG}T`, blocks: [{ label: 'Core work', time: '10:00', days: 'everyday' }] });
    await svc.assignToMentees(tpl.id, [a.id, b.id], mentor.id);

    const slotId = (tpl.blocks[0] && tpl.blocks[0].id) || 'core-work';
    // Confirm both mentees have the slot, kind 'empty' initially.
    const before = await svc.getMenteeSchedule(a.id);
    ok(before.schedule.some((s) => s.id === slotId && s.kind === 'empty'), 'slot seeded as empty on assign');

    // Apply a recurring config to ALL.
    const res = await svc.applySlotToAll(mentor.id, slotId, { kind: 'recurring', recurring: { title: 'Daily standup', type: 'discussion', recurrence: 'daily' } });
    ok(res.applied === 2, 'applied to both mentees');

    const sa = await svc.getMenteeSchedule(a.id);
    const sb = await svc.getMenteeSchedule(b.id);
    const slotA = sa.schedule.find((s) => s.id === slotId);
    const slotB = sb.schedule.find((s) => s.id === slotId);
    ok(slotA.kind === 'recurring' && slotA.recurring?.title === 'Daily standup', 'mentee A slot updated');
    ok(slotB.kind === 'recurring' && slotB.recurring?.title === 'Daily standup', 'mentee B slot updated');

    console.log(`\n${pass} passed, ${fail} failed`);
  } catch (err) {
    console.error('FATAL', err);
    fail++;
  } finally {
    await models.MenteeSchedule.destroy({ where: { menteeId: ids } });
    await models.ScheduleTemplate.destroy({ where: { ownerMentorId: ids } });
    for (const id of ids) await models.User.destroy({ where: { id } });
    await sequelize.close();
    process.exit(fail ? 1 : 0);
  }
})();
