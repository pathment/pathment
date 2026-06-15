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
  }
  if (program) {
    const roadmaps = await models.Roadmap.findAll({ where: { programId: program.id }, attributes: ["id"], paranoid: false });
    const rmIds = roadmaps.map((r) => r.id);
    if (rmIds.length) {
      // RoadmapProgress references roadmaps (the local copies) — clear any strays.
      if (models.RoadmapProgress) await models.RoadmapProgress.destroy({ where: { roadmapId: { [Op.in]: rmIds } }, force: true });
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
      canManagePrograms: true,
      canManageContent: true,
      canViewAnalytics: true,
      canManageSettings: true,
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
    date: daysAgo(4), type: "1:1", sentiment: "positive",
    summary: "Maya is well ahead and ready for a stretch goal. Walked through the API task early.",
    issues: [], nextSteps: ["Start the Express auth task", "Pair with a peer on testing"],
    personalityRead: "Highly self-directed, learns fast, thrives on autonomy.",
    workingStyle: { consistency: 90, communication: 80, resilience: 85, independence: 95 },
    blockers: [],
  });
  await models.MeetingNote.create({
    menteeId: noor.id, mentorId: omar.id, createdBy: omar.id,
    date: daysAgo(3), type: "1:1", sentiment: "neutral",
    summary: "Noor is juggling a full-time job. Behind on raw % but clearly putting in real effort. Logged delays as accepted.",
    issues: ["Limited weekday hours"], nextSteps: ["Break the API task into smaller chunks", "Check in mid-week"],
    personalityRead: "Conscientious and honest about constraints; communicates blockers early.",
    workingStyle: { consistency: 70, communication: 85, resilience: 80, independence: 65 },
    blockers: ["JWT refresh-token flow"],
  });

  // ── Schedules (org template + a couple of filled mentee schedules) ────────────
  const orgTemplate = await models.ScheduleTemplate.create({
    name: "Fellowship Weekly Rhythm", scope: "org", createdBy: admin.id,
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
