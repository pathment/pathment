/**
 * Demo seeder — a single, self-contained, demo-ready dataset for client demos.
 *
 * Creates one fully-populated program with everything the admin, mentor and
 * mentee experiences need to look real:
 *   • 1 admin, 2 lead mentors + 1 CO-MENTOR (with a permission override), 8 mentees
 *     (all log in with the same demo password)
 *   • 1 published program + running cohort + 2 clans
 *   • 1 org roadmap (6 ordered tasks) + a LOCAL imported copy per lead mentor
 *     (the real import→assign flow), with per-mentee roadmap progress
 *   • per-mentee enrollments + assigned tasks crafted to span the FULL risk
 *     spectrum (on-track, star, disengaged/at-risk, struggling-but-fighting,
 *     on-watch, awaiting-review, brand-new) so the mentor cockpit, at-risk page
 *     and review flow all show legitimate, varied data
 *   • real submissions (+ feedback on completed tasks) so the review flow works
 *   • a co-mentor promotion candidate awaiting admin approval
 *   • blockers, accepted delays, meeting notes, filled schedules, announcements
 *   • cohort-review SESSIONS + attendance (last week finished + today in-progress)
 *     so the weekly-review screen and the round attendance strip show real data
 *   • 1:1 scheduling — open availability slots + booked meetings (upcoming /
 *     completed / cancelled-with-reason) carrying real UTC instants + timezones
 *   • direct-message threads (mentor ↔ mentee), and notifications for every role
 *   • community posts across clan / program / global scopes (incl. a resolved
 *     question with an accepted answer, kudos and a win) + comments + reactions
 *   • anonymous mentor feedback (program_reviews, ≥3 each so the card unlocks)
 *   • daily activity logs (streaks), badges + points history + a leaderboard
 *   • roadmap chaining (Core → Advanced Patterns) and a sample bug report
 *
 * Idempotent: it always wipes and recreates the demo namespace (everything
 * scoped to @demo.pathment.com users + the demo program), so re-running gives
 * a clean, consistent dataset. It never touches real data.
 *
 * Run with:  npm run seed:demo
 */
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const bcrypt = require("bcrypt");
const { sequelize, models } = require("../src/db");
const { Op } = require("sequelize");

const DEMO_DOMAIN = "@demo.pathment.com";
const DEMO_PASSWORD = "Demo@1234";
const PROGRAM_NAME = "Full-Stack Engineering Fellowship (Demo)";

// Date helpers — everything is relative to "now" so the demo always looks fresh.
const DAY = 86400000;
const daysAgo = (n) => new Date(Date.now() - n * DAY);
const daysAhead = (n) => new Date(Date.now() + n * DAY);

async function cleanupDemo() {
  console.log("🧹 Clearing any existing demo namespace…");
  // paranoid:false so we also catch SOFT-DELETED demo users from a prior run —
  // otherwise their rows (and unique emails) linger and the re-seed collides.
  const demoUsers = await models.User.findAll({
    where: { email: { [Op.like]: `%${DEMO_DOMAIN}` } },
    attributes: ["id"],
    paranoid: false,
  });
  const userIds = demoUsers.map((u) => u.id);
  const program = await models.Program.findOne({ where: { name: PROGRAM_NAME }, paranoid: false });

  // Child rows first (FK order). Scope strictly to demo users / demo program.
  if (userIds.length) {
    // force:true everywhere — several models are paranoid (soft-delete), and a
    // soft delete would leave rows + unique emails behind and break the re-seed.
    const byMentee = { where: { menteeId: { [Op.in]: userIds } }, force: true };

    // Submissions / feedback hang off the demo's assigned tasks — clear them
    // before the tasks (deepest FK children first).
    const demoTasks = await models.AssignedTask.findAll({ where: { menteeId: { [Op.in]: userIds } }, attributes: ["id"], paranoid: false });
    const taskIds = demoTasks.map((t) => t.id);
    if (taskIds.length) {
      if (models.TaskFeedback) await models.TaskFeedback.destroy({ where: { assignedTaskId: { [Op.in]: taskIds } }, force: true });
      const subs = await models.TaskSubmission.findAll({ where: { assignedTaskId: { [Op.in]: taskIds } }, attributes: ["id"], paranoid: false });
      const subIds = subs.map((s) => s.id);
      if (subIds.length && models.TaskSubmissionFile) await models.TaskSubmissionFile.destroy({ where: { submissionId: { [Op.in]: subIds } }, force: true });
      await models.TaskSubmission.destroy({ where: { assignedTaskId: { [Op.in]: taskIds } }, force: true });
    }
    if (models.RoadmapProgress) await models.RoadmapProgress.destroy(byMentee);
    if (models.PromotionCandidate) await models.PromotionCandidate.destroy({ where: { [Op.or]: [{ menteeId: { [Op.in]: userIds } }, { nominatedBy: { [Op.in]: userIds } }] }, force: true });
    if (models.ClanMemberPermission) await models.ClanMemberPermission.destroy({ where: { userId: { [Op.in]: userIds } }, force: true });

    await models.MeetingNote.destroy({ where: { menteeId: { [Op.in]: userIds } }, force: true });
    await models.MenteeSchedule.destroy(byMentee);
    await models.Blocker.destroy(byMentee);
    await models.DelayEvent.destroy(byMentee);
    await models.AssignedTask.destroy(byMentee);
    await models.Enrollment.destroy(byMentee);
    await models.ClanMembership.destroy({ where: { userId: { [Op.in]: userIds } }, force: true });
    await models.Announcement.destroy({ where: { authorId: { [Op.in]: userIds } }, force: true });

    // ── Newer feature tables (added after the original seeder) ────────────────
    const userIn = { [Op.in]: userIds };
    // Cohort review sessions + their attendance entries (entries first).
    if (models.CohortReviewSession) {
      const sessions = await models.CohortReviewSession.findAll({ where: { mentorId: userIn }, attributes: ["id"], paranoid: false });
      const sessionIds = sessions.map((s) => s.id);
      if (sessionIds.length && models.CohortReviewEntry) await models.CohortReviewEntry.destroy({ where: { sessionId: { [Op.in]: sessionIds } }, force: true });
      if (models.CohortReviewUnlockRequest) await models.CohortReviewUnlockRequest.destroy({ where: { sessionId: { [Op.in]: sessionIds.length ? sessionIds : ["00000000-0000-0000-0000-000000000000"] } }, force: true });
      await models.CohortReviewSession.destroy({ where: { mentorId: userIn }, force: true });
    }
    // 1:1 scheduling — meetings before the slots they reference.
    if (models.ScheduledMeeting) await models.ScheduledMeeting.destroy({ where: { [Op.or]: [{ mentorId: userIn }, { menteeId: userIn }] }, force: true });
    if (models.AvailabilitySlot) await models.AvailabilitySlot.destroy({ where: { mentorId: userIn }, force: true });
    // Community — reactions + comments before posts.
    if (models.CommunityPost) {
      const posts = await models.CommunityPost.findAll({ where: { authorId: userIn }, attributes: ["id"], paranoid: false });
      const postIds = posts.map((p) => p.id);
      if (postIds.length) {
        if (models.CommunityReaction) await models.CommunityReaction.destroy({ where: { postId: { [Op.in]: postIds } }, force: true });
        if (models.CommunityComment) await models.CommunityComment.destroy({ where: { postId: { [Op.in]: postIds } }, force: true });
      }
      if (models.CommunityReaction) await models.CommunityReaction.destroy({ where: { userId: userIn }, force: true });
      if (models.CommunityComment) await models.CommunityComment.destroy({ where: { authorId: userIn }, force: true });
      await models.CommunityPost.destroy({ where: { authorId: userIn }, force: true });
    }
    // Messaging — messages + participants before conversations.
    if (models.Conversation) {
      const convos = await models.Conversation.findAll({ where: { createdBy: userIn }, attributes: ["id"], paranoid: false });
      const convoIds = convos.map((c) => c.id);
      if (models.Message) await models.Message.destroy({ where: { [Op.or]: [{ senderId: userIn }, { recipientId: userIn }] }, force: true });
      if (convoIds.length && models.ConversationParticipant) await models.ConversationParticipant.destroy({ where: { conversationId: { [Op.in]: convoIds } }, force: true });
      if (models.ConversationParticipant) await models.ConversationParticipant.destroy({ where: { userId: userIn }, force: true });
      await models.Conversation.destroy({ where: { createdBy: userIn }, force: true });
    }
    if (models.Notification) await models.Notification.destroy({ where: { userId: userIn }, force: true });
    if (models.DailyLogEntry) await models.DailyLogEntry.destroy({ where: { menteeId: userIn }, force: true });
    if (models.PointsHistory) await models.PointsHistory.destroy({ where: { userId: userIn }, force: true });
    if (models.UserBadge) await models.UserBadge.destroy({ where: { userId: userIn }, force: true });
    if (models.LeaderboardEntry) await models.LeaderboardEntry.destroy({ where: { userId: userIn }, force: true });
    if (models.ProgramReview) await models.ProgramReview.destroy({ where: { [Op.or]: [{ reviewerId: userIn }, { mentorId: userIn }] }, force: true });
    if (models.FeedbackReport) await models.FeedbackReport.destroy({ where: { reporterId: userIn }, force: true });
    if (models.ProductUpdate) await models.ProductUpdate.destroy({ where: { createdBy: userIn }, force: true });
  }
  if (program) {
    const roadmaps = await models.Roadmap.findAll({ where: { programId: program.id }, attributes: ["id"], paranoid: false });
    const rmIds = roadmaps.map((r) => r.id);
    if (rmIds.length) {
      // RoadmapProgress references roadmaps (the local copies) — clear any strays.
      if (models.RoadmapProgress) await models.RoadmapProgress.destroy({ where: { roadmapId: { [Op.in]: rmIds } }, force: true });
      // Chaining links between demo roadmaps (either direction).
      if (models.RoadmapLink) await models.RoadmapLink.destroy({ where: { [Op.or]: [{ fromRoadmapId: { [Op.in]: rmIds } }, { toRoadmapId: { [Op.in]: rmIds } }] }, force: true });
      await models.RoadmapTask.destroy({ where: { roadmapId: { [Op.in]: rmIds } }, force: true });
    }
    await models.Roadmap.destroy({ where: { programId: program.id }, force: true });
    await models.Clan.destroy({ where: { programId: program.id }, force: true });
    await models.Cohort.destroy({ where: { programId: program.id }, force: true });
    await models.Program.destroy({ where: { id: program.id }, force: true });
  }
  if (userIds.length) {
    if (models.UserSkill) await models.UserSkill.destroy({ where: { userId: { [Op.in]: userIds } }, force: true });
    await models.MenteeProfile.destroy({ where: { userId: { [Op.in]: userIds } }, force: true });
    await models.MentorProfile.destroy({ where: { userId: { [Op.in]: userIds } }, force: true });
    await models.AdminProfile.destroy({ where: { userId: { [Op.in]: userIds } }, force: true });
    await models.ScheduleTemplate.destroy({ where: { createdBy: { [Op.in]: userIds } }, force: true });
    await models.User.destroy({ where: { id: { [Op.in]: userIds } }, force: true });
  }
  console.log("✅ Demo namespace clear\n");
}

async function makeUser({ first, last, emailLocal, role, occupation, lastActivityDate, level }) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const user = await models.User.create({
    firstName: first,
    lastName: last,
    email: `${emailLocal}${DEMO_DOMAIN}`,
    passwordHash,
    role,
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
    profileCompleted: true,
    onboardingStep: 3,
  });

  if (role === "admin") {
    await models.AdminProfile.create({
      userId: user.id,
      permissions: ["all"],
      canManageUsers: true,
      canCreatePrograms: true,
      canViewAnalytics: true,
    });
  } else if (role === "mentor") {
    await models.MentorProfile.create({
      userId: user.id,
      yearsOfExperience: 7,
      maxMentees: 15,
      isAcceptingMentees: true,
      title: "Senior Software Engineer",
      organization: "Dev Weekends",
    });
  } else {
    await models.MenteeProfile.create({
      userId: user.id,
      currentOccupation: occupation || null,
      lastActivityDate: lastActivityDate || null,
      currentLevel: level || 1,
    });
  }
  return user;
}

async function seed() {
  console.log("🔍 Connecting to database…");
  await sequelize.authenticate();
  console.log("✅ Database connected\n");

  await cleanupDemo();

  // ── People ────────────────────────────────────────────────────────────────
  console.log("👤 Creating users…");
  const admin = await makeUser({ first: "Dana", last: "Reyes", emailLocal: "admin", role: "admin" });
  const aisha = await makeUser({ first: "Aisha", last: "Khan", emailLocal: "mentor.aisha", role: "mentor" });
  const omar = await makeUser({ first: "Omar", last: "Farooq", emailLocal: "mentor.omar", role: "mentor" });
  // A co-mentor on the Backend clan — showcases the co-mentor experience
  // (full lead parity by default, with a per-person permission override below).
  const sam = await makeUser({ first: "Sam", last: "Rivera", emailLocal: "mentor.sam", role: "mentor" });

  // 8 mentee archetypes spanning the full risk spectrum.
  // occupation + lastActivityDate feed the risk/fairness math directly.
  const menteeSpecs = [
    { first: "Maya", last: "Patel", local: "mentee.maya", clan: "FE", archetype: "star", occupation: "Frontend Developer", active: 0 },
    { first: "Leo", last: "Nguyen", local: "mentee.leo", clan: "FE", archetype: "on_track", occupation: "CS Student", active: 1 },
    { first: "Sara", last: "Ali", local: "mentee.sara", clan: "FE", archetype: "disengaged", occupation: null, active: 14 },
    { first: "Tom", last: "Becker", local: "mentee.tom", clan: "FE", archetype: "new", occupation: null, active: null },
    { first: "Noor", last: "Hassan", local: "mentee.noor", clan: "BE", archetype: "fighting", occupation: "Junior Backend Engineer", active: 2 },
    { first: "Ivan", last: "Petrov", local: "mentee.ivan", clan: "BE", archetype: "watch", occupation: "University Student", active: 6 },
    { first: "Priya", last: "Sharma", local: "mentee.priya", clan: "BE", archetype: "review", occupation: "Bootcamp Grad", active: 1 },
    { first: "Jack", last: "Owusu", local: "mentee.jack", clan: "BE", archetype: "average", occupation: "Self-taught", active: 3 },
  ];

  const mentees = {};
  for (const s of menteeSpecs) {
    const u = await makeUser({
      first: s.first, last: s.last, emailLocal: s.local, role: "mentee",
      occupation: s.occupation, lastActivityDate: s.active == null ? null : daysAgo(s.active),
      level: 1,
    });
    mentees[s.local] = { user: u, spec: s };
  }
  console.log(`✅ ${1 + 3 + 8} users created (1 admin, 3 mentors, 8 mentees)\n`);

  // ── Program + cohort ────────────────────────────────────────────────────────
  console.log("📚 Creating program, cohort & clans…");
  const program = await models.Program.create({
    createdBy: admin.id,
    name: PROGRAM_NAME,
    description:
      "A 12-week, project-based fellowship taking engineers from fundamentals to a deployed full-stack application, with weekly mentor reviews and clan-based peer support.",
    type: "mentorship",
    status: "published",
    visibility: "private",
    totalDurationWeeks: 12,
    estimatedHoursPerWeek: 12,
    startDate: daysAgo(7 * 7), // started ~7 weeks ago
    endDate: daysAhead(5 * 7),
    currentEnrollments: 8,
  });

  const cohort = await models.Cohort.create({
    programId: program.id,
    name: "Spring 2026 Cohort",
    status: "running",
    startDate: daysAgo(7 * 7),
    endDate: daysAhead(5 * 7),
    createdBy: admin.id,
  });

  const feClan = await models.Clan.create({
    programId: program.id,
    name: "Frontend Clan",
    leadMentorId: aisha.id,
    maxMentees: 25,
    status: "active",
    healthStatus: "green",
    createdBy: admin.id,
  });
  const beClan = await models.Clan.create({
    programId: program.id,
    name: "Backend Clan",
    leadMentorId: omar.id,
    maxMentees: 25,
    status: "active",
    healthStatus: "amber",
    createdBy: admin.id,
  });

  // Lead-mentor memberships (this is how the mentor cockpit discovers its cohort).
  await models.ClanMembership.create({ clanId: feClan.id, userId: aisha.id, role: "lead_mentor", status: "active" });
  await models.ClanMembership.create({ clanId: beClan.id, userId: omar.id, role: "lead_mentor", status: "active" });

  // Sam joins the Backend clan as a CO-MENTOR (full lead parity by default).
  await models.ClanMembership.create({ clanId: beClan.id, userId: sam.id, role: "co_mentor", status: "active" });
  // …with one permission turned off for him, to demo the per-co-mentor toggle:
  // he can mentor fully but can't see clan-wide analytics.
  if (models.ClanMemberPermission) {
    await models.ClanMemberPermission.create({
      clanId: beClan.id, userId: sam.id, denied: ["analytics.view"], updatedBy: omar.id,
    });
  }
  console.log("✅ Program, cohort & 2 clans created (incl. 1 co-mentor)\n");

  // ── Roadmap + tasks ──────────────────────────────────────────────────────────
  console.log("🗺️  Creating roadmap & tasks…");
  const roadmap = await models.Roadmap.create({
    programId: program.id,
    name: "Full-Stack Core Roadmap",
    description: "The shared backbone every fellow follows, week by week.",
    isBaseRoadmap: true,
    source: "org", // the shared org library roadmap mentors import + assign
    published: true,
    totalWeeks: 12,
    totalTasks: 6,
    skillTags: ["html", "css", "javascript", "react", "node", "postgres"],
  });

  const taskDefs = [
    { title: "Semantic HTML & accessible layout", type: "project", difficulty: "easy", week: 1, deliverable: "A responsive, accessible landing page." },
    { title: "Modern CSS & responsive design", type: "exercise", difficulty: "easy", week: 2, deliverable: "A mobile-first component library." },
    { title: "JavaScript fundamentals & DOM", type: "practical", difficulty: "medium", week: 3, deliverable: "An interactive to-do app, no frameworks." },
    { title: "React components & state", type: "project", difficulty: "medium", week: 5, deliverable: "A multi-view React dashboard." },
    { title: "REST APIs with Node & Express", type: "project", difficulty: "hard", week: 7, deliverable: "A CRUD API with auth." },
    { title: "Postgres data modeling", type: "assignment", difficulty: "hard", week: 9, deliverable: "A normalized schema + seeded queries." },
  ];
  const roadmapTasks = [];
  for (let i = 0; i < taskDefs.length; i++) {
    const d = taskDefs[i];
    roadmapTasks.push(
      await models.RoadmapTask.create({
        roadmapId: roadmap.id,
        title: d.title,
        description: `Week ${d.week}: ${d.title}. Build the deliverable, then submit for mentor review.`,
        type: d.type,
        difficulty: d.difficulty,
        taskOrder: i + 1,
        deliverable: d.deliverable,
        estimatedHours: 10,
        pointsBase: 10 + i * 2,
      })
    );
  }
  console.log(`✅ Org roadmap + ${roadmapTasks.length} tasks created\n`);

  // Each lead mentor IMPORTS the org roadmap into their own local copy (the real
  // mentor flow), with its own step rows. Mentees are then assigned tasks from
  // their clan lead's local copy — so "My roadmaps" is populated and the
  // lineage-aware "already assigned" logic has realistic data to work with.
  async function importLocalCopy(mentorId) {
    const copy = await models.Roadmap.create({
      programId: program.id,
      name: roadmap.name,
      description: roadmap.description,
      source: "local",
      published: false,
      importedFrom: roadmap.id,
      ownerMentorId: mentorId,
      isBaseRoadmap: false,
      totalTasks: taskDefs.length,
      skillTags: roadmap.skillTags,
    });
    const tasks = [];
    for (let i = 0; i < taskDefs.length; i++) {
      const d = taskDefs[i];
      tasks.push(
        await models.RoadmapTask.create({
          roadmapId: copy.id,
          title: d.title,
          description: `Week ${d.week}: ${d.title}. Build the deliverable, then submit for mentor review.`,
          type: d.type,
          difficulty: d.difficulty,
          taskOrder: i + 1,
          deliverable: d.deliverable,
          estimatedHours: 10,
          pointsBase: 10 + i * 2,
        })
      );
    }
    return { roadmap: copy, tasks };
  }
  const feRoadmap = await importLocalCopy(aisha.id);
  const beRoadmap = await importLocalCopy(omar.id);
  console.log("✅ Lead mentors imported their local roadmap copies\n");

  // ── Per-mentee enrollment + assigned tasks (the heart of the demo) ────────────
  console.log("🎯 Enrolling mentees & assigning work…");

  // archetype → how many roadmap tasks to assign and in what shape.
  // Returns a list of { idx, status, late, completedDaysAgo, dueDaysFromNow }.
  function planFor(archetype) {
    switch (archetype) {
      case "star": // 9th week, flying, recent completions → low risk, momentum up
        return {
          week: 9, progress: 82,
          tasks: [
            { idx: 0, status: "completed", completedDaysAgo: 50 },
            { idx: 1, status: "completed", completedDaysAgo: 40 },
            { idx: 2, status: "completed", completedDaysAgo: 28 },
            { idx: 3, status: "completed", completedDaysAgo: 5 },
            { idx: 4, status: "completed", completedDaysAgo: 2 },
            { idx: 5, status: "in_progress", dueDaysFromNow: 6 },
          ],
        };
      case "on_track": // steady, on pace → low
        return {
          week: 7, progress: 56,
          tasks: [
            { idx: 0, status: "completed", completedDaysAgo: 42 },
            { idx: 1, status: "completed", completedDaysAgo: 30 },
            { idx: 2, status: "completed", completedDaysAgo: 18 },
            { idx: 3, status: "completed", completedDaysAgo: 4 },
            { idx: 4, status: "in_progress", dueDaysFromNow: 5 },
          ],
        };
      case "disengaged": // has work, never touched it, silent 14 days → HIGH
        return {
          week: 7, progress: 8,
          tasks: [
            { idx: 0, status: "completed", completedDaysAgo: 38, late: true },
            { idx: 1, status: "assigned", dueDaysFromNow: -10 },
            { idx: 2, status: "assigned", dueDaysFromNow: -3 },
            { idx: 3, status: "assigned", dueDaysFromNow: 4 },
          ],
        };
      case "new": // just joined, no work assigned yet → LOW (the risk fix)
        return { week: 1, progress: 0, tasks: [] };
      case "fighting": // behind, but real logged friction (job + delays + blocker) → WATCH, softened
        return {
          week: 7, progress: 30,
          tasks: [
            { idx: 0, status: "completed", completedDaysAgo: 40 },
            { idx: 1, status: "completed", completedDaysAgo: 25, late: true },
            { idx: 2, status: "in_progress", dueDaysFromNow: 2 },
            { idx: 3, status: "assigned", dueDaysFromNow: 6 },
          ],
        };
      case "watch": // 1 blocker, quiet 6 days, stalled → WATCH
        return {
          week: 7, progress: 45,
          tasks: [
            { idx: 0, status: "completed", completedDaysAgo: 44 },
            { idx: 1, status: "completed", completedDaysAgo: 33 },
            { idx: 2, status: "completed", completedDaysAgo: 20 },
            { idx: 3, status: "in_progress", dueDaysFromNow: -2 },
          ],
        };
      case "review": // healthy but has submissions waiting on the mentor → LOW + pending
        return {
          week: 6, progress: 50,
          tasks: [
            { idx: 0, status: "completed", completedDaysAgo: 35 },
            { idx: 1, status: "completed", completedDaysAgo: 22 },
            { idx: 2, status: "submitted" },
            { idx: 3, status: "submitted" },
          ],
        };
      case "average": // unremarkable, on pace → LOW
      default:
        return {
          week: 5, progress: 40,
          tasks: [
            { idx: 0, status: "completed", completedDaysAgo: 30 },
            { idx: 1, status: "completed", completedDaysAgo: 16 },
            { idx: 2, status: "in_progress", dueDaysFromNow: 4 },
          ],
        };
    }
  }

  for (const s of menteeSpecs) {
    const m = mentees[s.local].user;
    const clan = s.clan === "FE" ? feClan : beClan;
    const mentor = s.clan === "FE" ? aisha : omar;
    const local = s.clan === "FE" ? feRoadmap : beRoadmap;
    const plan = planFor(s.archetype);

    const enrollment = await models.Enrollment.create({
      menteeId: m.id,
      programId: program.id,
      cohortId: cohort.id,
      status: "active",
      currentWeek: plan.week,
      tasksCompleted: plan.tasks.filter((t) => t.status === "completed").length,
      tasksTotal: plan.tasks.length,
      overallProgressPercentage: plan.progress,
      enrolledAt: daysAgo(7 * 7),
      startedAt: daysAgo(7 * 7),
      expectedCompletionDate: daysAhead(5 * 7),
      avgTaskRating: s.archetype === "star" ? 4.6 : s.archetype === "on_track" ? 4.1 : 3.6,
    });

    // Clan membership ties the mentee to the mentor's cohort.
    await models.ClanMembership.create({
      clanId: clan.id, userId: m.id, role: "mentee", status: "active", enrollmentId: enrollment.id,
    });

    const rating = s.archetype === "star" ? 5 : 4;
    for (const t of plan.tasks) {
      const rt = local.tasks[t.idx]; // assigned from the lead's local roadmap copy
      const hasSubmission = ["submitted", "completed"].includes(t.status);
      const completedAt = t.status === "completed" && t.completedDaysAgo != null ? daysAgo(t.completedDaysAgo) : null;
      const dueDate = t.dueDaysFromNow != null ? daysAhead(t.dueDaysFromNow) : (completedAt ? daysAgo(t.completedDaysAgo + 5) : null);
      const submittedAt = hasSubmission ? (completedAt || daysAgo(1)) : null;

      const at = await models.AssignedTask.create({
        roadmapTaskId: rt.id,
        menteeId: m.id,
        mentorId: mentor.id,
        enrollmentId: enrollment.id,
        status: t.status,
        assignedAt: daysAgo(50),
        dueDate,
        startedAt: ["in_progress", "submitted", "completed"].includes(t.status) ? daysAgo(t.completedDaysAgo != null ? t.completedDaysAgo + 4 : 6) : null,
        submittedAt,
        completedAt,
        isLate: !!t.late,
        currentSubmissionVersion: hasSubmission ? 1 : 0,
        pointsAwarded: t.status === "completed" ? rt.pointsBase : 0,
        finalRating: t.status === "completed" ? rating : null,
      });

      // Real submission rows so the mentor review/feedback flow has something to
      // open — 'pending' for awaiting-review, 'approved' + feedback for completed.
      if (hasSubmission) {
        const submission = await models.TaskSubmission.create({
          assignedTaskId: at.id,
          version: 1,
          submissionText: `Here's my work for "${rt.title}" — repo and notes attached. Happy to iterate on feedback.`,
          submissionUrls: ["https://github.com/demo/pathment-fellowship"],
          status: t.status === "completed" ? "approved" : "pending",
          submittedAt: submittedAt || daysAgo(1),
        });
        if (t.status === "completed") {
          await models.TaskFeedback.create({
            assignedTaskId: at.id,
            submissionId: submission.id,
            mentorId: mentor.id,
            feedbackText: "Solid work — meets the deliverable and the code is clean and well-structured. Nice job.",
            rating,
            isApproved: true,
            decision: "approved",
            feedbackType: "general",
          });
        }
      }
    }

    // Mentee's position in the linear roadmap (drives the mentee progress view +
    // the "already assigned" lock). currentStep = how many they've cleared.
    if (models.RoadmapProgress && plan.tasks.length) {
      const cleared = plan.tasks.filter((t) => t.status === "completed").length;
      await models.RoadmapProgress.create({
        roadmapId: local.roadmap.id,
        menteeId: m.id,
        enrollmentId: enrollment.id,
        currentStep: Math.min(cleared, local.tasks.length - 1),
        completed: cleared >= local.tasks.length,
        startedAt: daysAgo(7 * 7),
      });
    }
  }
  console.log("✅ Enrollments, assigned tasks, submissions & feedback created\n");

  // ── Blockers + accepted delays (drive watch/fighting + fairness credit) ───────
  console.log("🚧 Adding blockers, delays, notes & schedules…");
  const noor = mentees["mentee.noor"].user;
  const ivan = mentees["mentee.ivan"].user;
  const sara = mentees["mentee.sara"].user;

  await models.Blocker.create({
    menteeId: noor.id, createdBy: noor.id, title: "Stuck on JWT refresh-token flow",
    category: "technical", severity: "medium", status: "open", openedAt: daysAgo(3),
  });
  await models.Blocker.create({
    menteeId: ivan.id, createdBy: ivan.id, title: "Exam week — limited availability",
    category: "personal", severity: "medium", status: "open", openedAt: daysAgo(5),
  });
  await models.Blocker.create({
    menteeId: sara.id, createdBy: aisha.id, title: "No response — needs outreach",
    category: "personal", severity: "high", status: "open", openedAt: daysAgo(6),
  });

  // Noor: accepted external (job) delays → fairness credit lifts relative progress.
  await models.DelayEvent.create({
    menteeId: noor.id, reason: "Overtime at work during release week.",
    kind: "job", days: 4, accepted: true, category: "external", createdBy: omar.id, occurredAt: daysAgo(8),
  });
  await models.DelayEvent.create({
    menteeId: noor.id, reason: "Power outages disrupted study time.",
    kind: "electricity", days: 2, accepted: true, category: "external", createdBy: omar.id, occurredAt: daysAgo(3),
  });

  // ── Meeting notes (1:1s with a personality read) ──────────────────────────────
  await models.MeetingNote.create({
    menteeId: mentees["mentee.maya"].user.id, mentorId: aisha.id, createdBy: aisha.id,
    date: daysAgo(4), kind: "1:1", sentiment: "positive",
    summary: "Maya is well ahead and ready for a stretch goal. Walked through the API task early.",
    issues: [], nextSteps: ["Start the Express auth task", "Pair with a peer on testing"],
    personalityRead: "Highly self-directed, learns fast, thrives on autonomy.",
    workingStyle: { consistency: 90, communication: 80, resilience: 85, independence: 95 },
    blockers: [],
  });
  await models.MeetingNote.create({
    menteeId: noor.id, mentorId: omar.id, createdBy: omar.id,
    date: daysAgo(3), kind: "1:1", sentiment: "neutral",
    summary: "Noor is juggling a full-time job. Behind on raw % but clearly putting in real effort. Logged delays as accepted.",
    issues: ["Limited weekday hours"], nextSteps: ["Break the API task into smaller chunks", "Check in mid-week"],
    personalityRead: "Conscientious and honest about constraints; communicates blockers early.",
    workingStyle: { consistency: 70, communication: 85, resilience: 80, independence: 65 },
    blockers: ["JWT refresh-token flow"],
  });

  // ── Schedules (org template + a couple of filled mentee schedules) ────────────
  const orgTemplate = await models.ScheduleTemplate.create({
    name: "Fellowship Weekly Rhythm", source: "org", createdBy: admin.id,
    blocks: [
      { day: "Monday", label: "Clan standup", start: "09:00", end: "09:30" },
      { day: "Wednesday", label: "Focused build time", start: "14:00", end: "17:00" },
      { day: "Friday", label: "Mentor 1:1", start: "11:00", end: "11:30" },
    ],
  });
  const filledSchedule = [
    { day: "Monday", label: "Clan standup", start: "09:00", end: "09:30" },
    { day: "Wednesday", label: "Focused build time", start: "14:00", end: "17:00" },
    { day: "Friday", label: "Mentor 1:1", start: "11:00", end: "11:30" },
  ];
  await models.MenteeSchedule.create({
    menteeId: mentees["mentee.maya"].user.id, templateId: orgTemplate.id, schedule: filledSchedule, assignedBy: aisha.id,
  });
  await models.MenteeSchedule.create({
    menteeId: noor.id, templateId: orgTemplate.id, schedule: filledSchedule, assignedBy: omar.id,
  });

  // ── Announcements (org broadcasts) ─────────────────────────────────────────────
  await models.Announcement.create({
    title: "Welcome to the Spring 2026 Fellowship!", authorId: admin.id, audience: "all", pinned: true,
    body: "We're thrilled to kick off the cohort. Meet your clan, set up your schedule, and start Week 1. Reach out to your mentor anytime.",
  });
  await models.Announcement.create({
    title: "Week 7 — APIs & data modeling", authorId: admin.id, audience: "program", audienceId: program.id, pinned: false,
    body: "We're entering the backend stretch. Office hours are extended this week — book a slot with your mentor if you're stuck.",
  });

  console.log("✅ Blockers, delays, notes, schedules & announcements created\n");

  // ── Rich directory data (skills, profile stats, last-active) so the admin ────
  //    Mentors/Mentees tables look real instead of empty. ───────────────────────
  console.log("✨ Enriching profiles (skills, stats, last active)…");

  // Skills — find-or-create so it works whether or not seed:skills was run.
  const SKILL_NAMES = ["React", "Node.js", "TypeScript", "PostgreSQL", "CSS", "Testing", "Docker", "System Design", "JavaScript", "Express"];
  const skillByName = {};
  for (const name of SKILL_NAMES) {
    const [s] = await models.Skill.findOrCreate({ where: { name }, defaults: { name, category: "Engineering" } });
    skillByName[name] = s;
  }
  const attachSkills = async (userId, names, level) => {
    for (const n of names) {
      const s = skillByName[n];
      if (!s) continue;
      await models.UserSkill.findOrCreate({ where: { userId, skillId: s.id }, defaults: { userId, skillId: s.id, proficiencyLevel: level } });
    }
  };

  // Mentors: expertise + headline stats + a recent login.
  const mentorSpec = {
    [aisha.id]: ["React", "CSS", "TypeScript", "Testing"],
    [omar.id]: ["Node.js", "PostgreSQL", "Express", "System Design"],
    [sam.id]: ["JavaScript", "React", "Docker"],
  };
  for (const m of [aisha, omar, sam]) {
    const specs = mentorSpec[m.id] || [];
    await attachSkills(m.id, specs, 90);
    await models.User.update({ lastLoginAt: daysAgo(0) }, { where: { id: m.id } });
    await models.MentorProfile.update(
      { currentMenteeCount: 4, totalMenteesGuided: 6, avgFeedbackRating: 4.6, successRate: 92, specialization: specs },
      { where: { userId: m.id } }
    );
  }
  await models.User.update({ lastLoginAt: daysAgo(0) }, { where: { id: admin.id } });

  // Mentees: per-archetype gamification stats + skills + last login = last active.
  const MENTEE_STATS = {
    star:       { points: 1450, level: 6, streak: 18, tasks: 5, badges: 5, programs: 1, edu: "BSc Computer Science" },
    on_track:   { points: 820,  level: 4, streak: 7,  tasks: 4, badges: 3, programs: 1, edu: "BSc Computer Science" },
    disengaged: { points: 90,   level: 1, streak: 0,  tasks: 1, badges: 0, programs: 1, edu: "Self-learner" },
    new:        { points: 0,    level: 1, streak: 0,  tasks: 0, badges: 0, programs: 1, edu: "Bootcamp" },
    fighting:   { points: 540,  level: 3, streak: 4,  tasks: 3, badges: 2, programs: 1, edu: "Diploma in IT" },
    watch:      { points: 610,  level: 3, streak: 0,  tasks: 3, badges: 2, programs: 1, edu: "BSc (in progress)" },
    review:     { points: 700,  level: 3, streak: 5,  tasks: 4, badges: 3, programs: 1, edu: "Coding bootcamp" },
    average:    { points: 480,  level: 2, streak: 3,  tasks: 3, badges: 1, programs: 1, edu: "Self-taught" },
  };
  const MENTEE_SKILLS = ["JavaScript", "React", "CSS", "Node.js"];
  for (const s of menteeSpecs) {
    const u = mentees[s.local].user;
    const st = MENTEE_STATS[s.archetype] || MENTEE_STATS.average;
    await attachSkills(u.id, MENTEE_SKILLS.slice(0, 2 + (st.level % 3)), 50 + st.level * 5);
    await models.User.update({ lastLoginAt: s.active == null ? daysAgo(0) : daysAgo(s.active) }, { where: { id: u.id } });
    await models.MenteeProfile.update(
      {
        totalPoints: st.points, currentLevel: st.level, currentStreakDays: st.streak,
        longestStreakDays: Math.max(st.streak, st.streak + 4), totalTasksCompleted: st.tasks,
        totalBadgesEarned: st.badges, totalProgramsEnrolled: st.programs, totalProgramsCompleted: 0,
        avgTaskRating: st.points > 0 ? 4 : 0, currentEducation: st.edu,
      },
      { where: { userId: u.id } }
    );
  }
  console.log("✅ Profiles enriched (skills, points, levels, last active)\n");

  // ── Promotion pipeline (mentee → co-mentor) ──────────────────────────────────
  // Maya (the star) is nominated and marked ready, so /admin/promotions shows an
  // actionable card and the mentor Promotions page shows the pipeline.
  if (models.PromotionCandidate) {
    await models.PromotionCandidate.create({
      menteeId: mentees["mentee.maya"].user.id,
      nominatedBy: aisha.id,
      stage: "approved", // awaiting the admin's final promotion
      motivation: "Maya is well ahead of the cohort with a perfect on-time record and already helps peers unblock.",
      strengths: "Reliable, self-directed, and a clear communicator — a natural fit to co-lead.",
      availability: "5 hours / week",
    });
    console.log("✅ Promotion candidate created (Maya — awaiting admin)\n");
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  Newer feature areas (these tables didn't exist when the seeder was first
  //  written, so the demo looked empty on those screens). Everything below is
  //  scoped to demo users / the demo program and torn down by cleanupDemo().
  // ════════════════════════════════════════════════════════════════════════════

  // Small date helpers for the new sections.
  const ymd = (d) => d.toISOString().slice(0, 10); // DATEONLY 'YYYY-MM-DD'
  const dayLabel = (d) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const TZ = "Asia/Karachi";

  // Resolved mentee records with their clan + lead mentor (used throughout).
  const menteeList = menteeSpecs.map((s) => ({
    user: mentees[s.local].user,
    spec: s,
    clan: s.clan === "FE" ? feClan : beClan,
    mentor: s.clan === "FE" ? aisha : omar,
  }));
  const feMentees = menteeList.filter((m) => m.spec.clan === "FE");
  const beMentees = menteeList.filter((m) => m.spec.clan === "BE");
  const byLocal = (l) => mentees[l].user;

  // ── Cohort review sessions + attendance ──────────────────────────────────────
  // One finished review from last week (fully marked) + today's in-progress one
  // (only some marked, so the new round attendance strip shows real + "not yet
  // marked" states). This is what powers /mentor/review and the attendance UI.
  if (models.CohortReviewSession && models.CohortReviewEntry) {
    console.log("📋 Seeding cohort review sessions & attendance…");
    const ATT_BY_ARCH = {
      star: "present", on_track: "present", review: "present", average: "present",
      fighting: "present", watch: "excused", disengaged: "absent", new: "present",
    };
    async function seedReview(clan, mentor, clanMentees) {
      // Last week — a finished, fully-marked review.
      const finished = await models.CohortReviewSession.create({
        mentorId: mentor.id, clanId: clan.id, sessionDate: ymd(daysAgo(7)),
        title: "Weekly review — last week", status: "finished", finishedAt: daysAgo(7),
        note: "Solid momentum overall. Flagged two mentees for closer follow-up this week.",
      });
      for (const m of clanMentees) {
        await models.CohortReviewEntry.create({
          sessionId: finished.id, menteeId: m.user.id,
          attendance: ATT_BY_ARCH[m.spec.archetype] || "present", status: "reviewed",
        });
      }
      // Today — in-progress: mark roughly the first half, leave the rest unmarked.
      const today = await models.CohortReviewSession.create({
        mentorId: mentor.id, clanId: clan.id, sessionDate: ymd(new Date()),
        title: "Weekly review", status: "in_progress", note: null,
      });
      const half = Math.ceil(clanMentees.length / 2);
      for (let i = 0; i < clanMentees.length; i++) {
        const m = clanMentees[i];
        if (i < half) {
          await models.CohortReviewEntry.create({
            sessionId: today.id, menteeId: m.user.id,
            attendance: ATT_BY_ARCH[m.spec.archetype] || "present", status: "reviewed",
          });
        }
        // The rest get no entry yet → they render as "not marked" in the strip.
      }
    }
    await seedReview(feClan, aisha, feMentees);
    await seedReview(beClan, omar, beMentees);
    console.log("✅ Cohort review sessions + attendance created (last week + today)\n");
  }

  // ── 1:1 scheduling — availability slots + booked meetings ─────────────────────
  if (models.AvailabilitySlot && models.ScheduledMeeting) {
    console.log("🗓️  Seeding availability slots & 1:1 meetings…");
    async function openSlot(mentor, daysFromNow, hour) {
      const at = daysAhead(daysFromNow); at.setHours(hour, 0, 0, 0);
      return models.AvailabilitySlot.create({
        mentorId: mentor.id, day: dayLabel(at), date: ymd(at),
        time: `${String(hour).padStart(2, "0")}:00`, durationMins: 30, startsAt: at, timezone: TZ,
      });
    }
    async function book(mentor, mentee, daysFromNow, hour, status, reason) {
      const at = daysFromNow >= 0 ? daysAhead(daysFromNow) : daysAgo(-daysFromNow);
      at.setHours(hour, 0, 0, 0);
      const time = `${String(hour).padStart(2, "0")}:00`;
      const slot = await models.AvailabilitySlot.create({
        mentorId: mentor.id, day: dayLabel(at), date: ymd(at), time, durationMins: 30,
        startsAt: at, timezone: TZ, taken: true, takenBy: mentee.id,
      });
      await models.ScheduledMeeting.create({
        mentorId: mentor.id, menteeId: mentee.id, availabilitySlotId: slot.id, kind: "1:1",
        day: dayLabel(at), time, durationMins: 30, startsAt: at, timezone: TZ, status,
        agenda: status === "cancelled" ? "Unblock the API task" : "Weekly 1:1 — progress, blockers & next steps",
        cancellationReason: reason || null, cancelledBy: reason ? mentee.id : null,
      });
    }
    // A few open slots each, then some booked meetings spanning the lifecycle.
    for (const mentor of [aisha, omar]) {
      await openSlot(mentor, 1, 11);
      await openSlot(mentor, 2, 15);
      await openSlot(mentor, 4, 16);
    }
    await book(aisha, byLocal("mentee.maya"), 2, 14, "scheduled");
    await book(aisha, byLocal("mentee.leo"), -3, 15, "completed");
    await book(omar, byLocal("mentee.noor"), 1, 16, "scheduled");
    await book(omar, byLocal("mentee.priya"), -1, 13, "cancelled", "Hit a work deadline — will rebook for next week.");
    console.log("✅ Availability slots + 1:1 meetings created (open / upcoming / completed / cancelled)\n");
  }

  // ── Direct messages (mentor ↔ mentee threads) ────────────────────────────────
  if (models.Conversation && models.ConversationParticipant && models.Message) {
    console.log("✉️  Seeding direct message threads…");
    async function thread(a, b, msgs) {
      const directKey = [a.id, b.id].sort().join(":");
      const convo = await models.Conversation.create({
        type: "direct", createdBy: a.id, metadata: { directKey },
      });
      await models.ConversationParticipant.bulkCreate([
        { conversationId: convo.id, userId: a.id, role: "owner" },
        { conversationId: convo.id, userId: b.id, role: "participant" },
      ]);
      let last = null;
      for (const m of msgs) {
        const sender = m.from === "a" ? a : b;
        const recipient = m.from === "a" ? b : a;
        const when = daysAgo(m.ago);
        last = await models.Message.create({
          senderId: sender.id, recipientId: recipient.id, threadId: convo.id,
          messageText: m.text, isRead: !!m.read, readAt: m.read ? daysAgo(Math.max(0, m.ago - 1)) : null,
          deliveredAt: when, createdAt: when, updatedAt: when,
        });
      }
      if (last) await convo.update({ lastMessageId: last.id, lastMessageAt: last.createdAt }, { silent: true });
    }
    await thread(byLocal("mentee.maya"), aisha, [
      { from: "a", text: "Hi Aisha! I finished the React dashboard early — could I get a stretch goal?", ago: 4, read: true },
      { from: "b", text: "Love the energy 🙌 Take a look at the Express auth task and let's pair on testing Friday.", ago: 4, read: true },
      { from: "a", text: "On it. Thank you!", ago: 3, read: true },
    ]);
    await thread(byLocal("mentee.noor"), omar, [
      { from: "a", text: "Omar, work's been brutal this week. I logged the delays but I'm stuck on the JWT refresh flow.", ago: 3, read: true },
      { from: "b", text: "No worries Noor — you've been honest and consistent. Let's break the API task into smaller chunks on our 1:1.", ago: 2, read: true },
      { from: "b", text: "Also dropped a couple of links in your task feedback. Shout if they don't help.", ago: 1, read: false },
    ]);
    await thread(byLocal("mentee.priya"), omar, [
      { from: "a", text: "Submitted both tasks for review — keen to hear your thoughts whenever you get a sec!", ago: 1, read: false },
    ]);
    console.log("✅ Direct message threads created\n");
  }

  // ── Notifications (the bell — varied types, read + unread) ────────────────────
  if (models.Notification) {
    console.log("🔔 Seeding notifications…");
    const notify = (userId, type, title, message, o = {}) => models.Notification.create({
      userId, type, title, message, status: o.read ? "read" : "unread",
      actionUrl: o.actionUrl || null, actionLabel: o.actionLabel || null,
      relatedEntityType: o.ret || null, relatedEntityId: o.reid || null,
      readAt: o.read ? daysAgo(Math.max(0, (o.ago ?? 1) - 1)) : null,
      sentAt: daysAgo(o.ago ?? 1), createdAt: daysAgo(o.ago ?? 1), updatedAt: daysAgo(o.ago ?? 1),
    });
    // Mentors
    await notify(omar.id, "task", "Priya submitted 2 tasks for review", "Priya Sharma has work waiting on your review.", { actionUrl: "/mentor/approvals", actionLabel: "Review", ago: 1 });
    await notify(omar.id, "system", "Noor logged a blocker", "“Stuck on JWT refresh-token flow” — Noor Hassan.", { actionUrl: "/mentor/mentees", ago: 1 });
    await notify(aisha.id, "task", "Maya submitted a task", "Maya Patel submitted “React components & state”.", { actionUrl: "/mentor/approvals", actionLabel: "Review", ago: 2, read: true });
    await notify(aisha.id, "milestone", "Maya is ready for more", "Maya is well ahead of pace — consider a stretch goal.", { actionUrl: "/mentor/mentees", ago: 3, read: true });
    // Admin
    await notify(admin.id, "milestone", "Maya nominated for co-mentor", "Aisha nominated Maya Patel. Awaiting your approval.", { actionUrl: "/admin/promotions", actionLabel: "Open", ago: 2 });
    // Mentees
    await notify(byLocal("mentee.maya").id, "feedback", "Your task was approved 🎉", "Aisha approved “React components & state”. Nice work!", { actionUrl: "/mentee/tasks", actionLabel: "View", ago: 2, read: true });
    await notify(byLocal("mentee.noor").id, "task", "New task assigned", "Omar assigned “REST APIs with Node & Express”.", { actionUrl: "/mentee/tasks", actionLabel: "Start", ago: 1 });
    await notify(byLocal("mentee.sara").id, "system", "Your mentor checked in", "Aisha sent you a nudge — jump back in when you can.", { actionUrl: "/mentee/dashboard", ago: 1 });
    await notify(byLocal("mentee.priya").id, "feedback", "Feedback received", "Omar left feedback on your submission.", { actionUrl: "/mentee/tasks", ago: 1 });
    console.log("✅ Notifications created (mentors, admin & mentees)\n");
  }

  // ── Community posts + comments + reactions ────────────────────────────────────
  // Scopes: clan-private, program-wide, and global. Includes a resolved question
  // with an accepted answer and some kudos, so every community surface has life.
  if (models.CommunityPost && models.CommunityComment && models.CommunityReaction) {
    console.log("💬 Seeding community posts, comments & reactions…");
    const REACTIONS = ["like", "celebrate", "insightful", "helpful"];
    async function makePost(author, o) {
      const p = await models.CommunityPost.create({
        authorId: author.id, type: o.type || "discussion",
        scopeType: o.scopeType, scopeId: o.scopeId || null,
        title: o.title || null, body: o.body, toId: o.toId || null,
        tags: o.tags || [], resolved: !!o.resolved, commentCount: 0,
        createdAt: daysAgo(o.ago ?? 2), updatedAt: daysAgo(o.ago ?? 2),
      });
      let acceptedCommentId = null;
      const comments = o.comments || [];
      for (let i = 0; i < comments.length; i++) {
        const c = comments[i];
        const comment = await models.CommunityComment.create({
          postId: p.id, authorId: c.author.id, body: c.body,
          createdAt: daysAgo(c.ago ?? 1), updatedAt: daysAgo(c.ago ?? 1),
        });
        if (c.accepted) acceptedCommentId = comment.id;
      }
      const reactors = o.reactors || [];
      for (let i = 0; i < reactors.length; i++) {
        await models.CommunityReaction.create({
          postId: p.id, userId: reactors[i].id, type: REACTIONS[i % REACTIONS.length],
        });
      }
      const patch = { commentCount: comments.length };
      if (acceptedCommentId) patch.acceptedCommentId = acceptedCommentId;
      await p.update(patch, { silent: true });
      return p;
    }
    // Frontend clan — a resolved question with an accepted answer.
    await makePost(byLocal("mentee.leo"), {
      type: "question", scopeType: "clan", scopeId: feClan.id, resolved: true,
      title: "How do you structure React context for a multi-view dashboard?",
      body: "I keep prop-drilling. Splitting into multiple contexts vs one big store — what do you all do?",
      tags: ["react", "state"], ago: 3,
      comments: [
        { author: byLocal("mentee.maya"), body: "Split by concern — one context per domain. Way easier to test.", accepted: true, ago: 2 },
        { author: aisha, body: "Great answer Maya. Leo, start with 2–3 small contexts and only reach for a store if it gets noisy.", ago: 2 },
      ],
      reactors: [byLocal("mentee.maya"), aisha, byLocal("mentee.tom")],
    });
    // Frontend clan — a kudos shout-out.
    await makePost(aisha, {
      type: "kudos", scopeType: "clan", scopeId: feClan.id, toId: byLocal("mentee.maya").id,
      body: "Big shout-out to Maya for helping two peers unblock this week 👏", ago: 1,
      reactors: [byLocal("mentee.leo"), byLocal("mentee.tom"), omar],
    });
    // Backend clan — a real blocker turned discussion.
    await makePost(byLocal("mentee.noor"), {
      type: "question", scopeType: "clan", scopeId: beClan.id,
      title: "JWT refresh-token rotation — where do you store the refresh token?",
      body: "httpOnly cookie vs DB session table? Trying to get the security right without overcomplicating.",
      tags: ["node", "auth", "security"], ago: 2,
      comments: [{ author: omar, body: "httpOnly + secure cookie for the refresh token, rotate on use, keep a server-side allowlist. We'll walk through it on our 1:1.", ago: 1 }],
      reactors: [byLocal("mentee.priya"), byLocal("mentee.ivan")],
    });
    // Program-wide win + a global welcome.
    await makePost(byLocal("mentee.priya"), {
      type: "win", scopeType: "program", scopeId: program.id,
      body: "Shipped my first CRUD API with auth today 🚀 Three weeks ago I'd never touched Express. Thank you mentors!",
      tags: ["milestone"], ago: 2,
      reactors: [aisha, omar, byLocal("mentee.maya"), byLocal("mentee.noor")],
    });
    await makePost(admin, {
      type: "discussion", scopeType: "global",
      title: "Welcome to the Spring 2026 Fellowship 👋",
      body: "Introduce yourself, find your clan, and don't be shy about asking questions here. We're all building together.",
      ago: 6, reactors: [aisha, omar, byLocal("mentee.leo"), byLocal("mentee.jack")],
    });
    console.log("✅ Community posts, comments & reactions created\n");
  }

  // ── Anonymous mentor feedback (program_reviews) ───────────────────────────────
  // ≥3 reviews per mentor so the mentor's "How your mentees rate you" card
  // unlocks (the reveal gate is 3) and admin moderation has data.
  if (models.ProgramReview) {
    console.log("⭐ Seeding anonymous mentor feedback…");
    const dims = (a, b, c, d) => ({ responsiveness: a, helpfulness: b, clarity: c, support: d });
    async function review(reviewer, mentor, rating, d, text, rec) {
      await models.ProgramReview.create({
        programId: program.id, reviewerId: reviewer.id, mentorId: mentor.id,
        rating, dimensions: d, reviewText: text || null, wouldRecommend: rec,
        mentorQualityRating: rating,
      });
    }
    // Aisha (Frontend lead) — 4 reviews.
    await review(byLocal("mentee.maya"), aisha, 5, dims(5, 5, 5, 5), "Aisha pushes me with stretch goals and always replies fast. Best mentor I've had.", true);
    await review(byLocal("mentee.leo"), aisha, 4.5, dims(4, 5, 5, 4), "Explains tricky React concepts really clearly.", true);
    await review(byLocal("mentee.tom"), aisha, 4, dims(4, 4, 4, 5), "Patient with beginners — never makes you feel behind.", true);
    await review(byLocal("mentee.sara"), aisha, 4, dims(3, 4, 4, 5), null, true);
    // Omar (Backend lead) — 4 reviews.
    await review(byLocal("mentee.noor"), omar, 5, dims(5, 5, 4, 5), "Omar gets that life happens. Practical, honest, and breaks big problems down.", true);
    await review(byLocal("mentee.priya"), omar, 4.5, dims(5, 4, 5, 4), "Fast, detailed code review. I learn something every time.", true);
    await review(byLocal("mentee.ivan"), omar, 4, dims(4, 4, 4, 4), "Solid backend depth and good with deadlines.", true);
    await review(byLocal("mentee.jack"), omar, 3.5, dims(4, 3, 4, 4), null, true);
    console.log("✅ Mentor feedback created (Aisha ×4, Omar ×4 — above the reveal gate)\n");
  }

  // ── Daily activity logs (drive streaks / activity heat) ───────────────────────
  if (models.DailyLogEntry) {
    console.log("🔥 Seeding daily activity logs…");
    for (const m of menteeList) {
      const st = MENTEE_STATS[m.spec.archetype] || MENTEE_STATS.average;
      const streak = st.streak || 0;
      for (let i = 0; i < streak && i < 21; i++) {
        const d = daysAgo(i);
        await models.DailyLogEntry.create({
          menteeId: m.user.id, dateKey: ymd(d),
          note: i === 0 ? "Logged today's progress." : null, loggedAt: d,
        });
      }
    }
    console.log("✅ Daily activity logs created (per-mentee streaks)\n");
  }

  // ── Gamification — badges, points history & leaderboard ───────────────────────
  if (models.Badge && models.UserBadge && models.PointsHistory) {
    console.log("🏅 Seeding badges, points history & leaderboard…");
    const BADGES = [
      { name: "First Steps", description: "Completed your first task.", category: "milestone", criteriaType: "tasks_completed", criteriaValue: { count: 1 }, pointsReward: 20 },
      { name: "On Fire", description: "Reached a 7-day streak.", category: "streak", criteriaType: "streak_days", criteriaValue: { days: 7 }, pointsReward: 50 },
      { name: "Halfway Hero", description: "Crossed 50% program progress.", category: "progress", criteriaType: "progress_pct", criteriaValue: { pct: 50 }, pointsReward: 75 },
      { name: "Peer Helper", description: "Helped peers in the community.", category: "community", criteriaType: "community_kudos", criteriaValue: { count: 1 }, pointsReward: 40 },
    ];
    const badgeByName = {};
    for (const b of BADGES) {
      const [row] = await models.Badge.findOrCreate({ where: { name: b.name }, defaults: b });
      badgeByName[b.name] = row;
    }
    const award = async (user, names) => {
      for (const n of names) {
        const b = badgeByName[n];
        if (b) await models.UserBadge.create({ userId: user.id, badgeId: b.id, unlockedAt: daysAgo(3) });
      }
    };
    // Award by archetype, and lay down a couple of points-history rows each.
    for (const m of menteeList) {
      const st = MENTEE_STATS[m.spec.archetype] || MENTEE_STATS.average;
      const earned = [];
      if (st.tasks >= 1) earned.push("First Steps");
      if (st.streak >= 7) earned.push("On Fire");
      if ((m.spec.archetype === "star") || (m.spec.archetype === "on_track")) earned.push("Halfway Hero");
      if (m.spec.archetype === "star") earned.push("Peer Helper");
      await award(m.user, earned);
      // Points history — a small ledger so the points page isn't blank.
      let running = 0;
      const events = [];
      if (st.tasks >= 1) events.push({ change: 10, reason: "Completed “Semantic HTML & accessible layout”", ago: 30 });
      if (st.tasks >= 2) events.push({ change: 12, reason: "Completed “Modern CSS & responsive design”", ago: 16 });
      if (st.streak >= 7) events.push({ change: 50, reason: "Earned the On Fire badge", ago: 5 });
      for (const e of events) {
        const before = running; running += e.change;
        await models.PointsHistory.create({
          userId: m.user.id, pointsChange: e.change, pointsBefore: before, pointsAfter: running,
          sourceType: "task", reason: e.reason, createdAt: daysAgo(e.ago), updatedAt: daysAgo(e.ago),
        });
      }
    }
    // Program leaderboard (all-time), ranked by the points we set on profiles.
    if (models.LeaderboardEntry) {
      const ranked = [...menteeList]
        .map((m) => ({ user: m.user, points: (MENTEE_STATS[m.spec.archetype] || MENTEE_STATS.average).points }))
        .sort((a, b) => b.points - a.points);
      for (let i = 0; i < ranked.length; i++) {
        await models.LeaderboardEntry.create({
          userId: ranked[i].user.id, programId: program.id, rank: i + 1, points: ranked[i].points,
          periodType: "all_time", periodStart: ymd(daysAgo(7 * 7)), periodEnd: ymd(new Date()),
        });
      }
    }
    console.log("✅ Badges, points history & leaderboard created\n");
  }

  // ── Roadmap chaining — a follow-on roadmap linked after the core one ──────────
  if (models.RoadmapLink) {
    console.log("🔗 Seeding roadmap chaining…");
    const advanced = await models.Roadmap.create({
      programId: program.id, name: "Advanced Patterns & Deployment",
      description: "The follow-on track after the core roadmap: testing, CI/CD and shipping to production.",
      isBaseRoadmap: false, source: "org", published: true, totalWeeks: 4, totalTasks: 3,
      skillTags: ["testing", "ci/cd", "docker", "deployment"],
    });
    const advTasks = [
      { title: "Testing with Jest & React Testing Library", type: "project", difficulty: "medium" },
      { title: "CI/CD pipeline with GitHub Actions", type: "practical", difficulty: "hard" },
      { title: "Containerize & deploy with Docker", type: "project", difficulty: "hard" },
    ];
    for (let i = 0; i < advTasks.length; i++) {
      await models.RoadmapTask.create({
        roadmapId: advanced.id, title: advTasks[i].title,
        description: `${advTasks[i].title}. Build, then submit for mentor review.`,
        type: advTasks[i].type, difficulty: advTasks[i].difficulty, taskOrder: i + 1,
        estimatedHours: 10, pointsBase: 14 + i * 2,
      });
    }
    await models.RoadmapLink.create({ fromRoadmapId: roadmap.id, toRoadmapId: advanced.id, position: 0, createdBy: admin.id });
    console.log("✅ Roadmap chaining created (Core → Advanced Patterns)\n");
  }

  // ── A sample bug report (admin feedback inbox) ────────────────────────────────
  if (models.FeedbackReport) {
    await models.FeedbackReport.create({
      reporterId: byLocal("mentee.ivan").id, reporterRole: "mentee", type: "bug",
      title: "Task deadline shows the wrong day on mobile",
      description: "On my phone the due date is a day behind what the web shows. Might be a timezone thing.",
      status: "open", priority: "normal", pageUrl: "/mentee/tasks",
    });
    console.log("✅ Sample bug report created (admin feedback inbox)\n");
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🎉 Demo data ready!  All accounts use password:  " + DEMO_PASSWORD);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Admin    admin" + DEMO_DOMAIN);
  console.log("  Mentor   mentor.aisha" + DEMO_DOMAIN + "   (Frontend Clan — lead)");
  console.log("  Mentor   mentor.omar" + DEMO_DOMAIN + "    (Backend Clan — lead)");
  console.log("  Mentor   mentor.sam" + DEMO_DOMAIN + "     (Backend Clan — co-mentor, analytics off)");
  console.log("  Mentee   mentee.maya" + DEMO_DOMAIN + "    (star · nominated for co-mentor)");
  console.log("  Mentee   mentee.sara" + DEMO_DOMAIN + "    (at risk)");
  console.log("  Mentee   mentee.noor" + DEMO_DOMAIN + "    (struggling, fighting)");
  console.log("  Mentee   mentee.priya" + DEMO_DOMAIN + "   (submissions awaiting review)");
  console.log("  …+ 4 more mentees spanning on-track / watch / new");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Now also seeded: cohort-review sessions + attendance, 1:1 slots");
  console.log("  & meetings, DM threads, notifications, community posts, anonymous");
  console.log("  mentor feedback, daily streaks, badges/points/leaderboard, roadmap");
  console.log("  chaining (Core → Advanced) and a sample bug report.");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ Demo seed failed:", err.message);
    if (err.errors) err.errors.forEach((e) => console.error("   •", e.message));
    if (err.original) console.error("   Details:", err.original.message);
    process.exit(1);
  });
