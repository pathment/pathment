/* Synthetic E2E for the batch: slot dedup, mentee messaging restriction, AI
 * connections. Run: node scripts/test-feature-batch.js */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { models, sequelize } = require('../src/db');
const clanService = require('../src/services/clanService');
const scheduling = require('../src/services/schedulingService');
const messaging = require('../src/services/messagingService');
const ai = require('../src/services/aiConnectionService');

const TAG = `featbatch_${Date.now()}_`;
const e = (s) => (TAG + s + '@x.io').toLowerCase();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const created = { users: [], programs: [], clans: [], slots: [], aiConns: [] };

async function mkUser(first, caps) {
  const u = await models.User.create({ email: e(first), passwordHash: 'x', role: caps[0], capabilities: caps, firstName: first, lastName: 'T', emailVerified: true, status: 'active' });
  created.users.push(u.id);
  return u;
}

(async () => {
  try {
    const admin = await mkUser('admin', ['admin']);
    const mentor = await mkUser('mentor', ['mentor']);
    const menteeA = await mkUser('menteeA', ['mentee']);
    const menteeB = await mkUser('menteeB', ['mentee']);
    const outsider = await mkUser('outsider', ['mentee']);

    const program = await models.Program.create({ createdBy: admin.id, name: TAG + 'prog', description: 'd', type: 'mentorship', totalDurationWeeks: 12, status: 'published', visibility: 'private' });
    created.programs.push(program.id);
    const clan = await clanService.createClan({ programId: program.id, name: TAG + 'clan', leadMentorId: mentor.id }, admin.id);
    created.clans.push(clan.id);
    await clanService.addMember(clan.id, { userId: menteeA.id, role: 'mentee' });
    await clanService.addMember(clan.id, { userId: menteeB.id, role: 'mentee' });

    // ── 1. SLOT DEDUP ───────────────────────────────────────────────────────
    const s1 = await scheduling.publishSlot(mentor.id, { date: '2026-07-01', time: '2:00 PM', durationMins: 30 });
    created.slots.push(s1.id);
    ok(s1 && s1.date === '2026-07-01' && /Jul/.test(s1.day || ''), 'slot publishes with a date + derived day label');
    let dupThrew = false;
    try { await scheduling.publishSlot(mentor.id, { date: '2026-07-01', time: '2:00 PM' }); } catch (err) { dupThrew = /already published/i.test(err.message); }
    ok(dupThrew, 'duplicate slot (same mentor/date/time) is rejected');
    const s2 = await scheduling.publishSlot(mentor.id, { date: '2026-07-01', time: '3:00 PM' });
    created.slots.push(s2.id);
    ok(s2.id !== s1.id, 'a different time on the same date is allowed');

    // ── 2. MESSAGING RESTRICTION ──────────────────────────────────────────────
    const allowedA = await messaging.getAllowedRecipientIds(menteeA.id);
    ok(Array.isArray(allowedA) && allowedA.includes(mentor.id), 'mentee can message their clan mentor');
    ok(allowedA.includes(menteeB.id), 'mentee can message a clan co-member');
    ok(!allowedA.includes(outsider.id), 'mentee CANNOT message a non-clan user');
    ok((await messaging.getAllowedRecipientIds(mentor.id)) === null, 'mentor is unrestricted (null)');
    ok((await messaging.getAllowedRecipientIds(admin.id)) === null, 'admin is unrestricted (null)');

    let convThrew = false;
    try { await messaging.createOrGetDirectConversation(menteeA.id, outsider.id); } catch (err) { convThrew = /only message/i.test(err.message); }
    ok(convThrew, 'starting a conversation with a disallowed user is blocked');
    const conv = await messaging.createOrGetDirectConversation(menteeA.id, mentor.id);
    ok(Boolean(conv), 'mentee can start a conversation with their mentor');

    const picker = await messaging.searchUsers(menteeA.id, '');
    const pickerIds = picker.map((u) => u.id);
    ok(!pickerIds.includes(outsider.id) && pickerIds.includes(mentor.id), 'recipient picker only lists allowed users');

    // ── 3. AI CONNECTIONS (owner-scoped + resolution) ─────────────────────────
    const groqService = require('../src/services/groqService');

    // Admin → org connection (ownerId null); mentor → personal (ownerId = self).
    const orgConn = await ai.create({ provider: 'groq', label: TAG + 'org', key: 'gsk_org_secret_1234', model: 'llama-3.1-8b-instant' }, admin);
    const personalConn = await ai.create({ provider: 'openai', label: TAG + 'mine', key: 'sk-personal_secret_9876', model: 'gpt-4o-mini' }, mentor);
    created.aiConns.push(orgConn.id, personalConn.id);

    ok(orgConn.keyMasked.includes('••') && !orgConn.keyMasked.includes('secret'), 'AI key is returned masked, never plaintext');
    const orgRow = await models.AIConnection.findByPk(orgConn.id);
    ok(orgRow.ownerId === null && !orgRow.keyEncrypted.includes('gsk_org_secret'), 'org key: ownerId null + encrypted at rest');
    const personalRow = await models.AIConnection.findByPk(personalConn.id);
    ok(personalRow.ownerId === mentor.id, 'mentor key is scoped to the mentor (ownerId)');

    const adminList = await ai.list(admin);
    const mentorList = await ai.list(mentor);
    ok(adminList.some((c) => c.id === orgConn.id) && !adminList.some((c) => c.id === personalConn.id), 'admin sees only org connections');
    ok(mentorList.some((c) => c.id === personalConn.id) && !mentorList.some((c) => c.id === orgConn.id), 'mentor sees only their own connections');

    let crossThrew = false;
    try { await ai.remove(orgConn.id, mentor); } catch (err) { crossThrew = /not your connection/i.test(err.message); }
    ok(crossThrew, 'a mentor cannot delete an org connection');

    // Routing is per-owner.
    await ai.setRouting(admin, { summary: orgConn.id });
    await ai.setRouting(mentor, { summary: personalConn.id });
    ok((await ai.getRouting(admin)).summary === orgConn.id, 'org routing persists for admin');
    ok((await ai.getRouting(mentor)).summary === personalConn.id, 'personal routing persists for mentor');

    // Resolution: personal wins for the mentor; org for the system; round-trips the key.
    const personalCfg = await ai.resolveActiveConfig('summary', mentor.id);
    ok(personalCfg && personalCfg.apiKey === 'sk-personal_secret_9876' && personalCfg.model === 'gpt-4o-mini', 'resolve: mentor personal routing wins (decrypts key)');
    const orgCfg = await ai.resolveActiveConfig('summary', null);
    ok(orgCfg && orgCfg.apiKey === 'gsk_org_secret_1234', 'resolve: org routing used when no user');
    const fallbackCfg = await ai.resolveActiveConfig('delay', null);
    ok(fallbackCfg && fallbackCfg.apiKey === 'gsk_org_secret_1234', 'resolve: falls back to an org connection when feature unrouted');

    // groqService consumes the resolved connection (env key not required).
    const resolved = await groqService._resolve();
    ok(resolved.enabled && resolved.model === 'llama-3.1-8b-instant', 'groqService resolves a client from the configured org connection');

    await ai.remove(orgConn.id, admin);
    created.aiConns = created.aiConns.filter((id) => id !== orgConn.id);
    ok((await ai.getRouting(admin)).summary === null, 'removing a connection clears its routing');

    console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  } catch (err) {
    console.error('FATAL', err.message, err.stack);
    fail++;
  } finally {
    try {
      await models.ConversationParticipant.destroy({ where: { userId: created.users } }).catch(() => {});
      await models.Conversation.destroy({ where: { createdBy: created.users } }).catch(() => {});
      await models.AvailabilitySlot.destroy({ where: { id: created.slots } }).catch(() => {});
      await models.AIConnection.destroy({ where: { createdBy: created.users } }).catch(() => {});
      await models.SystemSettings.destroy({ where: { category: 'ai' } }).catch(() => {});
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
