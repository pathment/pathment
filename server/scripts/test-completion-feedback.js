/* E2E: mentor-confirmed completion + anonymous mentee→mentor feedback.
 * Run: node scripts/test-completion-feedback.js  (self-cleans) */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { models, sequelize } = require('../src/db');
const clanService = require('../src/services/clanService');
const taskService = require('../src/services/taskService');
const enrollmentService = require('../src/services/enrollmentService');
const programReviewService = require('../src/services/programReviewService');

const TAG = `cf_${Date.now()}_`;
const e = (s) => (TAG + s + '@x.io').toLowerCase();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const created = { users: [], programs: [], clans: [] };

async function mkUser(first, caps) {
  const u = await models.User.create({ email: e(first), passwordHash: 'x', role: caps[0], capabilities: caps, firstName: first, lastName: 'T', emailVerified: true, status: 'active' });
  created.users.push(u.id); return u;
}

// Assign a custom task, mark it completed, recompute stats.
async function finishOneTask(menteeId, mentorId, enrollmentId) {
  const task = await taskService.createCustomTask({ menteeId, title: TAG + 'task', type: 'project' }, mentorId);
  await models.AssignedTask.update({ status: 'completed', pointsAwarded: 10, finalRating: 4.5 }, { where: { id: task.id } });
  return taskService.updateEnrollmentTaskStats(enrollmentId);
}

async function setupMentee(program, clan, mentor, first) {
  const mentee = await mkUser(first, ['mentee']);
  await clanService.addMember(clan.id, { userId: mentee.id, role: 'mentee' });
  const enrollment = await models.Enrollment.findOne({ where: { menteeId: mentee.id, programId: program.id } });
  return { mentee, enrollment };
}

(async () => {
  try {
    const admin = await mkUser('admin', ['admin']);
    const mentor = await mkUser('mentor', ['mentor']);
    const program = await models.Program.create({ createdBy: admin.id, name: TAG + 'prog', description: 'd', type: 'mentorship', totalDurationWeeks: 12, status: 'published', visibility: 'private' });
    created.programs.push(program.id);
    const clan = await clanService.createClan({ programId: program.id, name: TAG + 'clan', leadMentorId: mentor.id }, admin.id);
    created.clans.push(clan.id);

    // ── Part A: mentor-confirmed completion ──────────────────────────────────
    const { mentee, enrollment } = await setupMentee(program, clan, mentor, 'mentee1');
    ok(['active', 'matched', 'pending_match'].includes(enrollment.status), 'enrollment created on clan placement');

    await finishOneTask(mentee.id, mentor.id, enrollment.id);
    let fresh = await models.Enrollment.findByPk(enrollment.id);
    ok(fresh.status === 'pending_completion', 'all tasks done → pending_completion (not silently completed)');
    ok(fresh.completionRequestedByRole === 'system', 'flagged as system-requested (mentor-prompted)');

    await new Promise((r) => setTimeout(r, 300)); // let the fire-and-forget sign-off prompt land
    const prompt = await models.Notification.findOne({ where: { userId: mentor.id, type: 'milestone', relatedEntityId: enrollment.id } });
    ok(Boolean(prompt), 'mentor was prompted to sign off (notification)');

    // Reverts when new work appears (system-flagged only).
    await finishOneTask(mentee.id, mentor.id, enrollment.id); // adds a 2nd task (not yet... it IS completed) -> still all done
    // Add an INCOMPLETE task to reopen.
    const reopen = await taskService.createCustomTask({ menteeId: mentee.id, title: TAG + 'reopen', type: 'project' }, mentor.id);
    await taskService.updateEnrollmentTaskStats(enrollment.id);
    fresh = await models.Enrollment.findByPk(enrollment.id);
    ok(fresh.status === 'active', 'new incomplete task reopens a system-flagged pending_completion → active');

    // Finish it again, then mentor confirms.
    await models.AssignedTask.update({ status: 'completed' }, { where: { id: reopen.id } });
    await taskService.updateEnrollmentTaskStats(enrollment.id);
    fresh = await models.Enrollment.findByPk(enrollment.id);
    ok(fresh.status === 'pending_completion', 'finishing the reopened task flags ready again');

    const result = await enrollmentService.approveCompletion(enrollment.id, mentor.id, 'mentor');
    ok(result.programCompleted === true, 'mentor confirms → program_completed');
    fresh = await models.Enrollment.findByPk(enrollment.id);
    ok(fresh.status === 'program_completed', 'enrollment is program_completed after sign-off');

    // Adding a task to a COMPLETED (mentor-approved) enrollment must NOT revert it.
    const after = await taskService.createCustomTask({ menteeId: mentee.id, title: TAG + 'after', type: 'project' }, mentor.id);
    await taskService.updateEnrollmentTaskStats(enrollment.id);
    fresh = await models.Enrollment.findByPk(enrollment.id);
    ok(fresh.status === 'program_completed', 'mentor-approved completion is terminal (not auto-reverted)');
    await models.AssignedTask.update({ status: 'cancelled' }, { where: { id: after.id } });

    const congrats = await models.Notification.findOne({ where: { userId: mentee.id, type: 'milestone', relatedEntityId: enrollment.id } });
    const feedbackReq = await models.Notification.findOne({ where: { userId: mentee.id, type: 'feedback', relatedEntityId: enrollment.id } });
    ok(Boolean(congrats), 'mentee got a completion congrats notification');
    ok(Boolean(feedbackReq), 'mentee got an anonymous-feedback request notification');

    // ── Part B: anonymous structured feedback ────────────────────────────────
    // Cannot review before completion:
    const { mentee: m2, enrollment: en2 } = await setupMentee(program, clan, mentor, 'mentee2');
    let threw = false;
    try { await programReviewService.submitReview(en2.id, m2.id, { dimensions: { clarity: 4 } }); } catch { threw = true; }
    ok(threw, 'cannot leave feedback before the program is completed');

    // Submit feedback for the completed mentee1:
    const sub = await programReviewService.submitReview(enrollment.id, mentee.id, {
      dimensions: { responsiveness: 5, helpfulness: 4, clarity: 5, support: 4 }, reviewText: 'Great mentor', wouldRecommend: true
    });
    ok(sub.review && !sub.updated, 'feedback submitted');
    ok(Number(sub.review.rating) === 4.5, 'overall rating = mean of dimensions (4.5)');
    ok(sub.review.mentorId === mentor.id, 'feedback resolved the correct mentor');

    // Wrong owner cannot review:
    let threw2 = false;
    try { await programReviewService.submitReview(enrollment.id, m2.id, { dimensions: { clarity: 1 } }); } catch { threw2 = true; }
    ok(threw2, 'a different mentee cannot review someone else’s enrollment');

    // Idempotent update (one per program+reviewer):
    const upd = await programReviewService.submitReview(enrollment.id, mentee.id, { dimensions: { responsiveness: 3, helpfulness: 3, clarity: 3, support: 3 } });
    ok(upd.updated === true, 're-submitting updates the same review (no duplicate)');
    const count = await models.ProgramReview.count({ where: { programId: program.id, reviewerId: mentee.id } });
    ok(count === 1, 'still exactly one review per (program, reviewer)');

    const mine = await programReviewService.getMyReview(enrollment.id, mentee.id);
    ok(mine.hasReviewed === true, 'getMyReview reports hasReviewed');

    // Mentor summary hidden until >= 3 responses:
    let summary = await programReviewService.getMentorFeedbackSummary(mentor.id);
    ok(summary.revealed === false, 'mentor summary hidden with < 3 responses (anonymity gate)');

    // Add two more completed mentees + reviews to cross the threshold.
    for (const name of ['mentee3', 'mentee4']) {
      const { mentee: mx, enrollment: enx } = await setupMentee(program, clan, mentor, name);
      await finishOneTask(mx.id, mentor.id, enx.id);
      await enrollmentService.approveCompletion(enx.id, mentor.id, 'mentor');
      await programReviewService.submitReview(enx.id, mx.id, { dimensions: { responsiveness: 4, helpfulness: 5, clarity: 4, support: 5 }, wouldRecommend: true });
    }
    summary = await programReviewService.getMentorFeedbackSummary(mentor.id);
    ok(summary.revealed === true, 'mentor summary revealed at 3 responses');
    ok(summary.total === 3 && typeof summary.overall === 'number', 'summary aggregates all responses');
    ok(summary.perDimension && summary.perDimension.clarity, 'per-dimension aggregates present');
    ok(summary.recommendRate !== null, 'recommend rate computed');

    // Admin raw view:
    const adminView = await programReviewService.getMentorFeedbackForAdmin(mentor.id);
    ok(adminView.reviews.length === 3, 'admin sees all raw reviews');
    ok(adminView.summary.revealed === true, 'admin always sees aggregate');

    console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  } catch (err) {
    console.error('FATAL', err.message, err.stack);
    fail++;
  } finally {
    try {
      await models.ProgramReview.destroy({ where: { programId: created.programs } }).catch(() => {});
      await models.Notification.destroy({ where: { userId: created.users } }).catch(() => {});
      await models.AssignedTask.destroy({ where: { menteeId: created.users } }).catch(() => {});
      const rts = await models.RoadmapTask.findAll({ include: [{ model: models.Roadmap, as: 'roadmap', where: { programId: created.programs }, required: true }] }).catch(() => []);
      await models.RoadmapTask.destroy({ where: { id: rts.map((r) => r.id) } }).catch(() => {});
      await models.Roadmap.destroy({ where: { programId: created.programs } }).catch(() => {});
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
