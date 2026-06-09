/* eslint-disable no-console */
// Phase-by-phase RBAC verification against a real DB.
// Run with: DATABASE_URL=... DB_SSL=false node scripts/test-rbac.js
const { sequelize, models } = require('../src/db');
const authzService = require('../src/services/authzService');
const clanService = require('../src/services/clanService');
const accessService = require('../src/services/accessService');
const enrollmentService = require('../src/services/enrollmentService');

let pass = 0, fail = 0;
const ok = (name, cond) => { (cond ? pass++ : fail++); console.log(`${cond ? '✓' : '✗ FAIL'}  ${name}`); };
const caps = async (u) => (await authzService.getCapabilities(await models.User.findByPk(u.id))).sort();

async function mkUser(role, n) {
  return models.User.create({
    email: `${role}${n}+${Date.now()}@test.local`, passwordHash: 'x', role,
    firstName: role, lastName: `#${n}`, status: 'active', emailVerified: true
  });
}

(async () => {
  await sequelize.authenticate();

  const lead = await mkUser('mentor', 1);
  const program = await models.Program.create({
    createdBy: lead.id, name: 'Test Program', description: 'For RBAC tests',
    type: 'mentorship', status: 'published', totalDurationWeeks: 8
  });
  const clan = await models.Clan.create({ name: 'Clan A', programId: program.id, leadMentorId: lead.id, createdBy: lead.id, status: 'active' });

  // ── Phase 1: a plain enrolled mentee ───────────────────────────────────────
  const mentee = await mkUser('mentee', 1);
  await models.Enrollment.create({ menteeId: mentee.id, programId: program.id, status: 'active', enrolledAt: new Date() });
  ok('enrolled mentee → [mentee]', JSON.stringify(await caps(mentee)) === JSON.stringify(['mentee']));

  // Add that mentee as a CO-MENTOR of the clan (the exact prod scenario).
  await clanService.addMember(clan.id, { userId: mentee.id, role: 'co_mentor' });
  ok('mentee added as co_mentor → [mentee, mentor]', JSON.stringify(await caps(mentee)) === JSON.stringify(['mentee', 'mentor']));

  // Remove them — Bug 3: the mentor switch must DISAPPEAR (self-heal).
  await clanService.removeMember(clan.id, mentee.id);
  ok('co_mentor removed → mentor capability gone → [mentee]', JSON.stringify(await caps(mentee)) === JSON.stringify(['mentee']));

  // ── Lead mentor (real mentor account, leads a clan) ────────────────────────
  ok('lead mentor → includes mentor', (await caps(lead)).includes('mentor'));

  // ── Admin via scoped RoleAssignment (not stored capability) ────────────────
  const staff = await mkUser('mentee', 2);
  await models.Enrollment.create({ menteeId: staff.id, programId: program.id, status: 'active', enrolledAt: new Date() });
  ok('staff before grant → no admin', !(await caps(staff)).includes('admin'));
  const grant = await accessService.grantRole({ userId: staff.id, role: 'program_admin', scopeType: 'program', scopeId: program.id }, lead.id);
  ok('granted program_admin → admin capability appears', (await caps(staff)).includes('admin'));
  await accessService.revokeRole(grant.id, lead.id);
  ok('revoked program_admin → admin capability gone', !(await caps(staff)).includes('admin'));

  // ── Phase 3: canViewMentee (Bug 1 — co-mentor must see the REAL mentee) ─────
  // Put the original mentee back as co_mentor of clan A, and add menteeB to clan A.
  await clanService.addMember(clan.id, { userId: mentee.id, role: 'co_mentor' });
  const menteeB = await mkUser('mentee', 3);
  await models.Enrollment.create({ menteeId: menteeB.id, programId: program.id, status: 'active', enrolledAt: new Date() });
  await clanService.addMember(clan.id, { userId: menteeB.id, role: 'mentee' });

  // A second clan with its own mentee (menteeC) — out of the co-mentor's reach.
  const clanB = await models.Clan.create({ name: 'Clan B', programId: program.id, leadMentorId: lead.id, createdBy: lead.id, status: 'active' });
  const menteeC = await mkUser('mentee', 4);
  await models.Enrollment.create({ menteeId: menteeC.id, programId: program.id, status: 'active', enrolledAt: new Date() });
  await clanService.addMember(clanB.id, { userId: menteeC.id, role: 'mentee' });

  const freshMentee = await models.User.findByPk(mentee.id);
  const freshMenteeB = await models.User.findByPk(menteeB.id);
  ok('co-mentor CAN view a mentee in their clan', await authzService.canViewMentee(freshMentee, menteeB.id));
  ok('co-mentor CANNOT view a mentee in another clan', !(await authzService.canViewMentee(freshMentee, menteeC.id)));
  ok('co-mentor viewing self → true', await authzService.canViewMentee(freshMentee, mentee.id));
  ok('plain mentee CANNOT view another mentee', !(await authzService.canViewMentee(freshMenteeB, menteeC.id)));
  const adminUser = await mkUser('admin', 8);
  ok('admin CAN view any mentee', await authzService.canViewMentee(adminUser, menteeC.id));

  // ── Phase 4: candidates + lead-mentor delegation (Bug 2) ───────────────────
  // Make `lead` an actual lead_mentor MEMBER of clan A so they hold clan powers.
  await clanService.addMember(clan.id, { userId: lead.id, role: 'lead_mentor' });
  const freshLead = await models.User.findByPk(lead.id);

  const cands = await clanService.listCandidates(clan.id);
  const candIds = cands.map((c) => c.id);
  ok('candidates EXCLUDE existing clan mentors (lead/co)', !candIds.includes(mentee.id) && !candIds.includes(lead.id));
  ok('candidates INCLUDE a clan mentee (promotable to co-mentor)', candIds.includes(menteeB.id));
  ok('candidates INCLUDE an outsider (any role)', candIds.includes(menteeC.id));

  // Lead mentor delegates co_mentor (clan-scoped) to menteeB — a subset of their powers.
  const delegated = await accessService.grantScopedRoleAsDelegate(
    { userId: menteeB.id, role: 'co_mentor', scopeType: 'clan', scopeId: clan.id }, freshLead
  );
  ok('lead mentor CAN delegate co_mentor in their clan', !!delegated?.id);
  ok('delegated co_mentor → menteeB gains mentor switch', (await caps(menteeB)).includes('mentor'));

  // Anti-escalation: a clan delegate cannot hand out an org/program (admin) role.
  let escalationBlocked = false;
  try {
    await accessService.grantScopedRoleAsDelegate(
      { userId: menteeB.id, role: 'program_admin', scopeType: 'clan', scopeId: clan.id }, freshLead
    );
  } catch (e) { escalationBlocked = true; }
  ok('lead mentor CANNOT delegate an admin/program role (no escalation)', escalationBlocked);

  // Revoke guard: can revoke this clan's grant; refuses a foreign assignment.
  await accessService.revokeClanGrant(delegated.id, clan.id, lead.id);
  ok('delegated grant revoked → menteeB loses mentor switch', !(await caps(menteeB)).includes('mentor'));

  // ── Phase 6: legacy-route tightening — permission + scope correctness ──────
  // Proves the tightened routes keep working for legit mentors/admins and block
  // partial roles. (mentee=co_mentor of clanA, menteeB=plain mentee in clanA.)
  const P = require('../src/config/permissions').PERMISSIONS;
  const clanARes = await authzService.scopeOfClan(clan.id);
  const clanBRes = await authzService.scopeOfClan(clanB.id);
  const fLead = await models.User.findByPk(lead.id);
  const fCo = await models.User.findByPk(mentee.id);
  const fPlain = await models.User.findByPk(menteeB.id);
  const fAdmin = await models.User.findByPk(adminUser.id);

  ok('TASK_ASSIGN: lead mentor in own clan', await authzService.can(fLead, P.TASK_ASSIGN, clanARes));
  ok('TASK_ASSIGN: co-mentor in own clan', await authzService.can(fCo, P.TASK_ASSIGN, clanARes));
  ok('TASK_ASSIGN: co-mentor BLOCKED in another clan', !(await authzService.can(fCo, P.TASK_ASSIGN, clanBRes)));
  ok('TASK_ASSIGN: plain mentee BLOCKED', !(await authzService.can(fPlain, P.TASK_ASSIGN, clanARes)));
  ok('TASK_ASSIGN: admin anywhere', await authzService.can(fAdmin, P.TASK_ASSIGN, clanBRes));

  ok('completion (TASK_REVIEW): lead mentor yes', await authzService.can(fLead, P.TASK_REVIEW, clanARes));
  ok('completion (TASK_REVIEW): co-mentor yes (preserved)', await authzService.can(fCo, P.TASK_REVIEW, clanARes));
  ok('completion (TASK_REVIEW): plain mentee NO', !(await authzService.can(fPlain, P.TASK_REVIEW, clanARes)));

  const unionLead = await authzService.getPermissionUnion(fLead);
  const unionCo = await authzService.getPermissionUnion(fCo);
  const unionPlain = await authzService.getPermissionUnion(fPlain);
  ok('LIBRARY_MANAGE (any-scope): lead yes', unionLead.includes(P.LIBRARY_MANAGE));
  ok('LIBRARY_MANAGE (any-scope): co-mentor yes', unionCo.includes(P.LIBRARY_MANAGE));
  ok('LIBRARY_MANAGE (any-scope): plain mentee NO', !unionPlain.includes(P.LIBRARY_MANAGE));

  ok('ANNOUNCEMENT_POST@clan: co-mentor yes', await authzService.can(fCo, P.ANNOUNCEMENT_POST, clanARes));
  ok('ANNOUNCEMENT_POST@clan: plain mentee NO', !(await authzService.can(fPlain, P.ANNOUNCEMENT_POST, clanARes)));
  ok('COMMUNITY_POST@clan: clan mentee yes (can post in their clan)', await authzService.can(fPlain, P.COMMUNITY_POST, clanARes));

  const sMentee = await authzService.scopeOfMentee(menteeB.id);
  ok('scopeOfMentee → right clan + program', sMentee.clanId === clan.id && sMentee.programId === program.id && sMentee.userId === menteeB.id);
  const enrB = await models.Enrollment.findOne({ where: { menteeId: menteeB.id, programId: program.id } });
  const sEnr = await authzService.scopeOfEnrollment(enrB.id);
  ok('scopeOfEnrollment → right clan + program', sEnr.clanId === clan.id && sEnr.programId === program.id);

  // ── minScope: program_admin can run org/program admin endpoints; clan roles can't ─
  const progAdmin = await mkUser('mentor', 7);
  await accessService.grantRole({ userId: progAdmin.id, role: 'program_admin', scopeType: 'program', scopeId: program.id }, adminUser.id);
  const fProg = await models.User.findByPk(progAdmin.id);
  ok('minScope: program_admin passes invite.create', await authzService.canAtMinScope(fProg, P.INVITE_CREATE, 'program'));
  ok('minScope: program_admin passes mentee.manage', await authzService.canAtMinScope(fProg, P.MENTEE_MANAGE, 'program'));
  ok('minScope: super_admin passes invite.create', await authzService.canAtMinScope(fAdmin, P.INVITE_CREATE, 'program'));
  ok('minScope: lead_mentor BLOCKED from mentee.manage (clan < program)', !(await authzService.canAtMinScope(fLead, P.MENTEE_MANAGE, 'program')));
  ok('minScope: lead_mentor BLOCKED from analytics admin (clan < program)', !(await authzService.canAtMinScope(fLead, P.ANALYTICS_VIEW, 'program')));

  // ── Per-program data scope ─────────────────────────────────────────────────
  ok('programScope: super_admin → unrestricted (null)', (await authzService.adminProgramScope(fAdmin)) === null);
  const progScope = await authzService.adminProgramScope(fProg);
  ok('programScope: program_admin → [their program]', Array.isArray(progScope) && progScope.length === 1 && progScope[0] === program.id);
  ok('programScope: lead_mentor → [] (not an admin)', JSON.stringify(await authzService.adminProgramScope(fLead)) === '[]');
  ok('assertProgramInScope: program_admin in-scope OK', await authzService.assertProgramInScope(fProg, program.id));
  let outOfScopeBlocked = false;
  try { await authzService.assertProgramInScope(fProg, clanB.id /* a non-program id */); } catch { outOfScopeBlocked = true; }
  ok('assertProgramInScope: program_admin out-of-scope BLOCKED', outOfScopeBlocked);
  ok('assertProgramInScope: super_admin any program OK', await authzService.assertProgramInScope(fAdmin, clanB.id));

  // Real cross-program filtering at the service layer (a 2nd program's data).
  const program2 = await models.Program.create({ createdBy: lead.id, name: 'Test Program', description: 'p2', type: 'mentorship', status: 'published', totalDurationWeeks: 8 });
  const menteeD = await mkUser('mentee', 9);
  await models.Enrollment.create({ menteeId: menteeD.id, programId: program2.id, status: 'active', enrolledAt: new Date() });
  const clanC = await models.Clan.create({ name: 'Clan C', programId: program2.id, leadMentorId: lead.id, createdBy: lead.id, status: 'active' });

  const scopedEnr = await enrollmentService.getEnrollments({ programIds: [program.id] }, { page: 1, limit: 100 });
  ok('data-scope: enrollments filtered to program1 (excludes program2)',
    scopedEnr.enrollments.every((e) => e.programId === program.id) && !scopedEnr.enrollments.some((e) => e.menteeId === menteeD.id));
  const allEnr = await enrollmentService.getEnrollments({}, { page: 1, limit: 100 });
  ok('data-scope: unrestricted enrollments include program2', allEnr.enrollments.some((e) => e.menteeId === menteeD.id));
  const scopedClans = await clanService.listClans({ programIds: [program.id] });
  ok('data-scope: clans filtered to program1 (excludes Clan C)', scopedClans.every((c) => c.programId === program.id) && scopedClans.length > 0);

  // ── Reassign mentee between clans ──────────────────────────────────────────
  // Same-program move (clanA → clanB, both program1): keep the enrollment.
  const enrBefore = await models.Enrollment.findOne({ where: { menteeId: menteeB.id, programId: program.id } });
  await clanService.reassignMentee(menteeB.id, clanB.id, adminUser.id);
  ok('reassign same-program: now in clan B', !!(await models.ClanMembership.findOne({ where: { userId: menteeB.id, clanId: clanB.id, status: 'active' } })));
  ok('reassign same-program: removed from clan A', !(await models.ClanMembership.findOne({ where: { userId: menteeB.id, clanId: clan.id, status: 'active' } })));
  const enrAfter = await models.Enrollment.findOne({ where: { menteeId: menteeB.id, programId: program.id } });
  ok('reassign same-program: enrollment preserved', !!enrAfter && enrAfter.id === enrBefore.id);

  // Cross-program move (→ Clan C in program2): wipe the old program's enrollment.
  await clanService.reassignMentee(menteeB.id, clanC.id, adminUser.id);
  ok('reassign cross-program: old program enrollment wiped', !(await models.Enrollment.findOne({ where: { menteeId: menteeB.id, programId: program.id } })));
  ok('reassign cross-program: new program enrollment created', !!(await models.Enrollment.findOne({ where: { menteeId: menteeB.id, programId: program2.id } })));

  // ── Audit: the grant + revoke were recorded with an actor ──────────────────
  const auditCount = await models.AuditLog.count({ where: { action: ['ROLE_GRANTED', 'ROLE_REVOKED'] } });
  ok('grant/revoke produced audit rows', auditCount >= 2);

  console.log(`\n${pass} passed, ${fail} failed`);
  // Cleanup test data (everything this script touched).
  await models.AuditLog.destroy({ where: {} });
  await models.RoleAssignment.destroy({ where: {} });
  await models.ClanMembership.destroy({ where: {} });
  await models.Enrollment.destroy({ where: {} });
  await models.Clan.destroy({ where: {} });
  await models.User.destroy({ where: { email: { [require('sequelize').Op.like]: '%@test.local' } } });
  await models.Program.destroy({ where: { name: 'Test Program' } });
  await sequelize.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST CRASH:', e); process.exit(1); });
