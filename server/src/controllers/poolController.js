/**
 * System Pool — operator, reviewer and candidate endpoints.
 *
 * Authorisation lives in the routes (`pool.*` at the pool's programme, see
 * routes/pools.js) and again in the services for anything that touches a
 * task. Candidate endpoints are self-only and never take a user id.
 */
const { Op } = require('sequelize');
const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const { parseCsv } = require('../utils/csv');
const { ValidationError } = require('../utils/errors/errorTypes');
const logger = require('../utils/logger');
const { models } = require('../db');
const authzService = require('../services/authzService');
const poolService = require('../services/poolService');
const poolMemberService = require('../services/poolMemberService');
const poolTaskService = require('../services/poolTaskService');
const poolReviewService = require('../services/poolReviewService');
const poolScoringService = require('../services/poolScoringService');
const poolPlacementService = require('../services/poolPlacementService');
const poolCandidateService = require('../services/poolCandidateService');
const poolAvatarService = require('../services/poolAvatarService');
const submissionService = require('../services/submissionService');

const assignments = async (req) => (req.loadAssignments ? req.loadAssignments() : undefined);
const ok = (res, message, data, status = 200) => res.status(status).json(successResponse(message, data, status));

// ─── Pools ─────────────────────────────────────────────────────────────────────

exports.listPools = catchAsync(async (req, res) => {
  const programIds = await authzService.poolProgramScope(req.user, { assignments: await assignments(req) });
  const pools = await poolService.listPools({ programIds, status: req.query.status || null, programId: req.query.programId || null });
  ok(res, 'Pools retrieved', { pools });
});

/** Everything the pool screens need to pick from, bounded to what the caller may touch. */
exports.options = catchAsync(async (req, res) => {
  const programIds = await authzService.poolProgramScope(req.user, { assignments: await assignments(req) });
  const programs = await models.Program.findAll({
    where: Array.isArray(programIds) ? { id: { [Op.in]: programIds } } : {},
    attributes: ['id', 'name', 'status'],
    order: [['name', 'ASC']],
  });
  const programId = req.query.programId && programs.some((p) => p.id === req.query.programId) ? req.query.programId : null;
  const [cohorts, clans, quizKits, interviewKits, roadmaps] = programId ? await Promise.all([
    models.Cohort.findAll({ where: { programId }, attributes: ['id', 'name', 'status'], order: [['createdAt', 'DESC']] }),
    models.Clan.findAll({ where: { programId, kind: 'cohort' }, attributes: ['id', 'name', 'status', 'maxMentees', 'frozenAt'], order: [['name', 'ASC']] }),
    models.QuizKit.findAll({ where: { status: 'published' }, attributes: ['id', 'title'], order: [['title', 'ASC']] }),
    models.InterviewKit.findAll({ where: { status: 'published' }, attributes: ['id', 'title'], order: [['title', 'ASC']] }),
    /*
     * Roadmaps WITH their steps, as a roadmap-shaped tree.
     *
     * This used to answer with a flat list of every step in the programme,
     * ordered by title, each step labelled with the roadmap it came from. A
     * six-month fellowship is six roadmaps of thirty-odd steps, so the picker
     * was two hundred rows in alphabetical order with no way to look INTO a
     * roadmap — which is how an operator actually chooses work ("the month
     * three steps"). The roadmap is the unit now, and its steps come with it
     * in teaching order.
     *
     * Every roadmap is returned, including one whose steps are all quizzes or
     * interviews, so the picker can say why it is empty rather than leaving
     * the roadmap out and looking as though it does not exist.
     */
    models.Roadmap.findAll({
      where: { programId },
      attributes: ['id', 'name', 'description', 'published', 'source', 'totalWeeks'],
      include: [{
        model: models.RoadmapTask,
        as: 'steps',
        attributes: ['id', 'title', 'type', 'difficulty', 'taskOrder', 'estimatedHours'],
        required: false,
      }],
      order: [['name', 'ASC'], [{ model: models.RoadmapTask, as: 'steps' }, 'taskOrder', 'ASC']],
    }),
  ]) : [[], [], [], [], []];

  const assignable = poolTaskService.SUBMITTABLE_TYPES;
  const roadmapTree = roadmaps.map((r) => {
    const steps = (r.steps || []).map((t) => ({
      id: t.id,
      title: t.title,
      type: t.type,
      difficulty: t.difficulty,
      taskOrder: t.taskOrder,
      estimatedHours: t.estimatedHours,
      // A quiz or interview step is assigned through its own kit, not as a
      // task, so it is shown and explained rather than silently dropped.
      assignable: assignable.includes(t.type),
    }));
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      published: r.published,
      source: r.source,
      totalWeeks: r.totalWeeks,
      stepCount: steps.length,
      assignableCount: steps.filter((s) => s.assignable).length,
      steps,
    };
  });
  // Kept for anything still reading a flat list; the tree is what the picker uses.
  const roadmapSteps = roadmapTree.flatMap((r) =>
    r.steps.filter((s) => s.assignable).map((s) => ({ ...s, roadmapId: r.id, roadmap: { id: r.id, name: r.name } })));

  // Edorax courses the workspace may assign. Not programme-scoped — the
  // connection is per workspace. An unconnected or unreachable Edorax answers
  // with an empty list rather than failing the whole options call, so the rest
  // of the picker still works and the UI can say why courses are unavailable.
  let courses = [];
  let coursesConnected = false;
  try {
    const courseService = require('../services/courseService');
    const status = await courseService.status();
    coursesConnected = Boolean(status.connected);
    if (coursesConnected) {
      courses = (await courseService.listCourses()).map((c) => ({
        courseId: c.courseId,
        title: c.title,
        availableSeats: c.availableSeats,
        pricingType: c.pricingType,
      }));
    }
  } catch (error) {
    logger.warn('Pool options could not list Edorax courses', { message: error.message });
  }

  ok(res, 'Pool options', {
    programs, cohorts, clans, quizKits, interviewKits,
    courses, coursesConnected,
    roadmaps: roadmapTree,
    roadmapSteps,
    difficultyPoints: poolService.DIFFICULTY_POINTS_DEFAULT,
  });
});

exports.createPool = catchAsync(async (req, res) => {
  const pool = await poolService.createPool(req.body, req.user);
  ok(res, 'Pool created', { pool }, 201);
});

exports.getPool = catchAsync(async (req, res) => {
  ok(res, 'Pool retrieved', await poolService.dashboard(req.params.id));
});

exports.updatePool = catchAsync(async (req, res) => {
  const pool = await poolService.updatePool(req.params.id, req.body, req.user);
  ok(res, 'Pool updated', { pool });
});

exports.setStatus = catchAsync(async (req, res) => {
  const pool = req.body.status === 'archived'
    ? await poolService.archive(req.params.id, req.user)
    : await poolService.setStatus(req.params.id, req.body.status, req.user);
  ok(res, 'Pool status updated', { pool });
});

exports.history = catchAsync(async (req, res) => {
  ok(res, 'Pool history', { events: await poolService.history(req.params.id) });
});

// ─── Members ───────────────────────────────────────────────────────────────────

/** Body: { csv: "<text>" } or { emails: "a@x, b@y" | [] } or { rows: [{ email, firstName, lastName }] }. */
exports.importMembers = catchAsync(async (req, res) => {
  let rows = [];
  if (typeof req.body.csv === 'string' && req.body.csv.trim()) {
    const parsed = parseCsv(req.body.csv);
    rows = parsed.headers.some((h) => /e-?mail/i.test(h))
      ? parsed.rows
      // A header-less list of addresses: the first line is data too.
      : [parsed.headers.join(','), ...parsed.rows.map((r) => Object.values(r).join(','))].flatMap((l) => l.split(/[,;\s]+/)).filter(Boolean);
  } else if (typeof req.body.emails === 'string') {
    rows = req.body.emails.split(/[,;\s]+/).filter(Boolean);
  } else if (Array.isArray(req.body.emails)) {
    rows = req.body.emails;
  } else if (Array.isArray(req.body.rows)) {
    rows = req.body.rows;
  }
  if (!rows.length) throw new ValidationError('Paste email addresses or upload a CSV with an email column');
  const result = await poolMemberService.importMembers(req.params.id, rows, req.user);
  ok(res, 'Candidates processed', result);
});

exports.listApplications = catchAsync(async (req, res) => {
  const pool = await poolService.getPool(req.params.id);
  const inPool = await models.PoolMember.findAll({ where: { poolId: pool.id }, attributes: ['email'], raw: true });
  const taken = new Set(inPool.map((m) => m.email));
  const where = {};
  if (req.query.status) where.status = req.query.status;
  // Any cohort, of any programme whose intake the caller runs (always the pool's own).
  const cohorts = await models.Cohort.findAll({ attributes: ['id', 'programId'], raw: true });
  const allowed = await poolMemberService.applicationPrograms(pool, req.user, cohorts.map((c) => c.programId));
  const applications = await models.Application.findAll({
    where,
    include: [{
      model: models.Cohort, as: 'cohort', attributes: ['id', 'name'],
      where: { programId: { [Op.in]: [...allowed] } }, required: true,
      include: [{ model: models.Program, as: 'program', attributes: ['id', 'name'] }],
    }],
    attributes: ['id', 'email', 'firstName', 'lastName', 'status', 'assessmentScore', 'createdAt'],
    order: [['createdAt', 'DESC']],
    limit: 2000,
  });
  ok(res, 'Applications', {
    applications: applications.map((a) => ({ ...a.toJSON(), inPool: taken.has(String(a.email || '').toLowerCase()) })),
  });
});

exports.addFromApplications = catchAsync(async (req, res) => {
  ok(res, 'Applications processed', await poolMemberService.addFromApplications(req.params.id, req.body.applicationIds, req.user));
});

exports.resendInvite = catchAsync(async (req, res) => {
  ok(res, 'Invitation sent', await poolMemberService.resendInvite(req.params.id, req.params.memberId, req.user));
});

exports.withdrawMember = catchAsync(async (req, res) => {
  const member = await poolMemberService.exit(req.params.id, req.params.memberId, 'withdrawn', req.body.reason, req.user);
  ok(res, 'Candidate withdrawn', { member });
});

exports.disqualifyMember = catchAsync(async (req, res) => {
  const member = await poolMemberService.exit(req.params.id, req.params.memberId, 'disqualified', req.body.reason, req.user);
  ok(res, 'Candidate disqualified', { member });
});

exports.setManualScore = catchAsync(async (req, res) => {
  const member = await poolMemberService.setManualScore(req.params.id, req.params.memberId, req.body, req.user);
  ok(res, 'Score saved', { manualScores: member.manualScores });
});

// ─── Work ──────────────────────────────────────────────────────────────────────

exports.listAssignments = catchAsync(async (req, res) => {
  ok(res, 'Pool work', { assignments: await poolTaskService.listAssignments(req.params.id) });
});

exports.createAssignment = catchAsync(async (req, res) => {
  ok(res, 'Work created', await poolTaskService.createAssignment(req.params.id, req.body, req.user), 201);
});

exports.addRoadmapSteps = catchAsync(async (req, res) => {
  ok(res, 'Work added', await poolTaskService.addRoadmapSteps(req.params.id, req.body, req.user), 201);
});

exports.updateAssignment = catchAsync(async (req, res) => {
  const assignment = await poolTaskService.updateAssignment(req.params.id, req.params.assignmentId, req.body, req.user);
  ok(res, 'Work updated', { assignment });
});

exports.assignToMember = catchAsync(async (req, res) => {
  const assignmentIds = Array.isArray(req.body.assignmentIds) ? req.body.assignmentIds : null;
  ok(res, 'Work assigned', await poolTaskService.assignToMember(req.params.id, req.params.memberId, { assignmentIds }, req.user));
});

exports.assign = catchAsync(async (req, res) => {
  const memberIds = Array.isArray(req.body.memberIds) ? req.body.memberIds : null;
  ok(res, 'Work assigned', await poolTaskService.assign(req.params.id, req.params.assignmentId, { memberIds }, req.user));
});

exports.cancelAssignment = catchAsync(async (req, res) => {
  const assignment = await poolTaskService.cancelAssignment(req.params.id, req.params.assignmentId, req.body.reason, req.user);
  ok(res, 'Work cancelled', { assignment });
});

// ─── The pool photo ────────────────────────────────────────────────────────────

exports.uploadAvatar = catchAsync(async (req, res) => {
  ok(res, 'File uploaded', await poolAvatarService.uploadAvatarFile(req.params.id, req.user, req.file), 201);
});

exports.setAvatar = catchAsync(async (req, res) => {
  ok(res, 'Pool photo updated', await poolAvatarService.setAvatarUrl(req.params.id, req.user, req.body?.avatarUrl));
});

exports.removeAvatar = catchAsync(async (req, res) => {
  ok(res, 'Pool photo removed', await poolAvatarService.removeAvatar(req.params.id, req.user));
});

// ─── Review ────────────────────────────────────────────────────────────────────

exports.reviewQueue = catchAsync(async (req, res) => {
  ok(res, 'Review queue', { items: await poolReviewService.queue(req.params.id) });
});

exports.submissionDetail = catchAsync(async (req, res) => {
  ok(res, 'Submission', await poolReviewService.detail(req.params.id, req.params.submissionId));
});

exports.reviewSubmission = catchAsync(async (req, res) => {
  ok(res, 'Review saved', await poolReviewService.review(req.params.id, req.params.submissionId, req.body, req.user));
});

// ─── Scores, shortlist, decisions ──────────────────────────────────────────────

exports.scores = catchAsync(async (req, res) => {
  ok(res, 'Scores', await poolScoringService.liveScores(req.params.id));
});

exports.listShortlists = catchAsync(async (req, res) => {
  ok(res, 'Shortlists', { shortlists: await poolScoringService.listShortlists(req.params.id) });
});

exports.generateShortlist = catchAsync(async (req, res) => {
  const result = await poolScoringService.generate(req.params.id, req.user);
  ok(res, result.reused ? 'Nothing changed — this is the latest shortlist' : 'Shortlist generated', result, result.reused ? 200 : 201);
});

exports.getShortlist = catchAsync(async (req, res) => {
  ok(res, 'Shortlist', { shortlist: await poolScoringService.getShortlist(req.params.id, req.params.shortlistId) });
});

exports.confirmShortlist = catchAsync(async (req, res) => {
  const shortlist = await poolScoringService.confirm(req.params.id, req.params.shortlistId, req.body, req.user);
  ok(res, 'Selection confirmed', { shortlist });
});

exports.setDecision = catchAsync(async (req, res) => {
  const member = await poolScoringService.setDecision(req.params.id, req.params.memberId, req.body, req.user);
  ok(res, 'Decision changed', { member });
});

// ─── Placement ─────────────────────────────────────────────────────────────────

exports.placementPreview = catchAsync(async (req, res) => {
  const clanIds = req.query.clanIds ? String(req.query.clanIds).split(',').filter(Boolean) : null;
  ok(res, 'Placement preview', await poolPlacementService.preview(req.params.id, { clanIds }));
});

exports.setPlacementTargets = catchAsync(async (req, res) => {
  ok(res, 'Placement planned', await poolPlacementService.setTargets(req.params.id, req.body.targets, req.user));
});

exports.runPlacement = catchAsync(async (req, res) => {
  const memberIds = Array.isArray(req.body.memberIds) ? req.body.memberIds : null;
  ok(res, 'Placement run', await poolPlacementService.place(req.params.id, { memberIds }, req.user));
});

// ─── Candidate (self only) ─────────────────────────────────────────────────────

exports.myPools = catchAsync(async (req, res) => {
  ok(res, 'My pools', { pools: await poolCandidateService.myPools(req.user.id) });
});

exports.myTasks = catchAsync(async (req, res) => {
  ok(res, 'My qualifying work', { tasks: await poolCandidateService.myTasks(req.user.id) });
});

exports.myTask = catchAsync(async (req, res) => {
  ok(res, 'Qualifying work', { task: await poolCandidateService.myTask(req.user.id, req.params.taskId) });
});

exports.startMyTask = catchAsync(async (req, res) => {
  await poolTaskService.startTask(req.params.taskId, req.user.id);
  ok(res, 'Started', { task: await poolCandidateService.myTask(req.user.id, req.params.taskId) });
});

exports.submitMyTask = catchAsync(async (req, res) => {
  await poolCandidateService.assertOwnPoolTask(req.user.id, req.params.taskId);
  const submission = await submissionService.submitTaskWithFiles(req.params.taskId, req.user.id, req.body, req.files || []);
  ok(res, 'Submitted', { submission }, 201);
});
