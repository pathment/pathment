const { models } = require('../db');
const { Op, fn, col } = require('sequelize');
const { catchAsync } = require('../middlewares/errorHandler');
const { NotFoundError } = require('../utils/errors/errorTypes');
const authzService = require('../services/authzService');

/**
 * GET /mentees
 * List all registered mentees with profile stats (admin only)
 */
const getAllMentees = catchAsync(async (req, res) => {
  const { search, page = 1, limit = 20 } = req.query;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;

  // Include suspended users so they stay visible and can be UNsuspended — only
  // hide pending/deleted accounts. (Filtering to active-only made a just-suspended
  // person vanish, so there was no row left to un-suspend.)
  const where = { role: 'mentee', status: { [Op.in]: ['active', 'suspended'] } };

  // A program_admin sees only mentees enrolled in their programs (org admins: all).
  const programScope = await authzService.adminProgramScope(req.user, {
    assignments: req.loadAssignments ? await req.loadAssignments() : undefined
  });
  if (Array.isArray(programScope) && programScope.length) {
    const enr = await models.Enrollment.findAll({
      where: { programId: { [Op.in]: programScope } }, attributes: ['menteeId']
    });
    const ids = [...new Set(enr.map((e) => e.menteeId).filter(Boolean))];
    where.id = ids.length ? { [Op.in]: ids } : { [Op.in]: ['00000000-0000-0000-0000-000000000000'] };
  }

  const searchConditions = search
    ? {
        [Op.or]: [
          { firstName: { [Op.iLike]: `%${search}%` } },
          { lastName: { [Op.iLike]: `%${search}%` } },
          { email: { [Op.iLike]: `%${search}%` } },
        ],
      }
    : {};

  const { count, rows: mentees } = await models.User.findAndCountAll({
    where: { ...where, ...searchConditions },
    attributes: ['id', 'firstName', 'lastName', 'email', 'status', 'createdAt', 'profilePictureUrl'],
    include: [
      {
        model: models.MenteeProfile,
        as: 'menteeProfile',
        attributes: [
          'currentEducation',
          'currentOccupation',
          'totalProgramsEnrolled',
          'totalProgramsCompleted',
          'totalTasksCompleted',
          'totalPoints',
          'currentLevel',
          'currentStreakDays',
          'lastActivityDate',
          'totalBadgesEarned',
        ],
      },
    ],
    order: [['firstName', 'ASC']],
    limit: limitNum,
    offset,
    distinct: true,
  });

  // Attach each mentee's current clan (+ its program) so the UI can offer an
  // accurate "move clan" with a cross-program warning. One batched query.
  const menteeIds = mentees.map((m) => m.id);
  const memberships = menteeIds.length
    ? await models.ClanMembership.findAll({
        where: { userId: { [Op.in]: menteeIds }, role: 'mentee', status: 'active' },
        include: [{ model: models.Clan, as: 'clan', attributes: ['id', 'name', 'programId'] }],
      })
    : [];
  const clanByUser = new Map();
  for (const m of memberships) {
    if (m.clan && !clanByUser.has(m.userId)) {
      clanByUser.set(m.userId, { id: m.clan.id, name: m.clan.name, programId: m.clan.programId });
    }
  }
  const rows = mentees.map((m) => {
    const json = m.toJSON();
    json.currentClan = clanByUser.get(m.id) || null;
    return json;
  });

  res.status(200).json({
    status: 'success',
    data: { mentees: rows },
    pagination: {
      page: pageNum,
      limit: limitNum,
      totalItems: count,
      totalPages: Math.ceil(count / limitNum),
    },
  });
});

/**
 * GET /mentees/:id
 * Get a single mentee's full profile with active enrollments (admin only)
 */
const getMenteeById = catchAsync(async (req, res) => {
  const { id } = req.params;

  const mentee = await models.User.findOne({
    where: { id, role: 'mentee' },
    attributes: ['id', 'firstName', 'lastName', 'email', 'profilePictureUrl', 'createdAt', 'lastLoginAt'],
    include: [
      {
        model: models.MenteeProfile,
        as: 'menteeProfile',
        attributes: [
          'currentEducation',
          'currentOccupation',
          'learningGoals',
          'interests',
          'priorExperience',
          'preferredLearningStyle',
          'totalProgramsEnrolled',
          'totalProgramsCompleted',
          'totalTasksCompleted',
          'avgTaskRating',
          'currentStreakDays',
          'longestStreakDays',
          'lastActivityDate',
          'totalPoints',
          'currentLevel',
          'totalBadgesEarned',
        ],
      },
      {
        model: models.Skill,
        as: 'skills',
        attributes: ['id', 'name', 'category'],
        through: { attributes: ['proficiencyLevel'] },
      },
    ],
  });

  if (!mentee) throw new NotFoundError('Mentee not found');

  // ── Mentor resolution is CLAN-based (the live data model) ──
  // This org assigns a mentee by placing them in a clan, NOT by creating a
  // MentorMenteeMatch row. The legacy match-based join therefore always read
  // empty (mentor/clan came back null). We resolve the assigned mentor from the
  // mentee's active clan(s) — the clan's lead mentor — and pull co-mentors too.
  // Mirrors getMentorById's clan-first approach. All queries are batched.
  const clanMemberships = await models.ClanMembership.findAll({
    where: { userId: id, status: 'active', role: 'mentee' },
    include: [{
      model: models.Clan,
      as: 'clan',
      attributes: ['id', 'name', 'programId', 'leadMentorId'],
      include: [{ model: models.Program, as: 'program', attributes: ['id', 'name'] }],
    }],
  }).catch(() => []);

  const clans = clanMemberships.map((m) => m.clan).filter(Boolean);
  const clanIds = [...new Set(clans.map((c) => c.id))];
  // Primary (current) clan = the first active membership's clan.
  const currentClan = clans[0]
    ? { id: clans[0].id, name: clans[0].name, programId: clans[0].programId }
    : null;

  // Assigned mentor = the (current) clan's lead mentor. Collect lead mentors
  // across all the mentee's clans + every co-mentor in those clans in one query.
  const leadMentorIds = [...new Set(clans.map((c) => c.leadMentorId).filter(Boolean))];
  const coMentorMemberships = clanIds.length
    ? await models.ClanMembership.findAll({
        where: { clanId: { [Op.in]: clanIds }, status: 'active', role: { [Op.in]: ['lead_mentor', 'co_mentor'] } },
        attributes: ['userId', 'clanId', 'role'],
      }).catch(() => [])
    : [];
  const mentorUserIds = [...new Set([
    ...leadMentorIds,
    ...coMentorMemberships.map((m) => m.userId),
  ].filter(Boolean))];

  const mentorUsers = mentorUserIds.length
    ? await models.User.findAll({
        where: { id: { [Op.in]: mentorUserIds } },
        attributes: ['id', 'firstName', 'lastName', 'email', 'profilePictureUrl'],
      }).catch(() => [])
    : [];
  const mentorById = new Map(mentorUsers.map((u) => [u.id, u]));

  // The assigned mentor (current clan's lead). Fall back to any lead mentor.
  const assignedMentorId = clans[0]?.leadMentorId || leadMentorIds[0] || null;
  const assignedMentor = assignedMentorId && mentorById.get(assignedMentorId)
    ? mentorById.get(assignedMentorId).toJSON()
    : null;

  // Co-mentors of the mentee's clans (exclude the assigned lead, de-dupe).
  const coMentors = [...new Set(
    coMentorMemberships
      .filter((m) => m.role === 'co_mentor' && m.userId !== assignedMentorId)
      .map((m) => m.userId)
  )]
    .map((uid) => mentorById.get(uid))
    .filter(Boolean)
    .map((u) => u.toJSON());

  // Enrollments with program name + progress + status.
  const enrollments = await models.Enrollment.findAll({
    where: { menteeId: id },
    attributes: [
      'id', 'programId', 'status', 'overallProgressPercentage',
      'tasksCompleted', 'tasksTotal', 'totalPointsEarned', 'enrolledAt',
    ],
    include: [{ model: models.Program, as: 'program', attributes: ['id', 'name', 'type'] }],
    order: [['enrolledAt', 'DESC']],
    limit: 20,
  }).catch(() => []);

  // Tag each enrollment with the clan whose program it matches (so the UI can
  // show "program · clan · mentor" per enrollment), and the assigned mentor.
  const clanByProgram = new Map();
  for (const c of clans) {
    if (c.programId && !clanByProgram.has(c.programId)) clanByProgram.set(c.programId, c);
  }
  const enrollmentRows = enrollments.map((e) => {
    const json = e.toJSON();
    const cl = clanByProgram.get(e.programId) || null;
    json.clan = cl ? { id: cl.id, name: cl.name } : currentClan;
    const leadId = cl?.leadMentorId || assignedMentorId;
    json.mentor = leadId && mentorById.get(leadId) ? mentorById.get(leadId).toJSON() : assignedMentor;
    return json;
  });

  // ── Live stats from AssignedTask (counters can drift) ──
  const [tasksTotal, tasksCompleted, pointsRow, recentTasks] = await Promise.all([
    models.AssignedTask.count({ where: { menteeId: id } }).catch(() => 0),
    models.AssignedTask.count({ where: { menteeId: id, status: 'completed' } }).catch(() => 0),
    models.AssignedTask.findAll({
      where: { menteeId: id, status: 'completed' },
      attributes: [[fn('COALESCE', fn('SUM', col('points_awarded')), 0), 'pts']],
      raw: true,
    }).catch(() => [{ pts: 0 }]),
    models.AssignedTask.findAll({
      where: { menteeId: id },
      attributes: ['id', 'status', 'pointsAwarded', 'pointsBase', 'titleOverride', 'completedAt', 'updatedAt'],
      include: [{ model: models.RoadmapTask, as: 'roadmapTask', attributes: ['id', 'title'] }],
      order: [['updatedAt', 'DESC']],
      limit: 8,
    }).catch(() => []),
  ]);
  const points = Number(pointsRow?.[0]?.pts || 0)
    || enrollmentRows.reduce((s, e) => s + (e.totalPointsEarned || 0), 0);

  const recentTaskRows = recentTasks.map((t) => {
    const json = t.toJSON();
    return {
      id: json.id,
      title: json.titleOverride || json.roadmapTask?.title || 'Task',
      status: json.status,
      points: json.pointsAwarded ?? json.pointsBase ?? 0,
      completedAt: json.completedAt || null,
      updatedAt: json.updatedAt || null,
    };
  });

  // Overall progress = average of non-terminal-weighted enrollment progress.
  const overallProgress = enrollmentRows.length
    ? Math.round(
        enrollmentRows.reduce((s, e) => s + Number(e.overallProgressPercentage || 0), 0) /
        enrollmentRows.length
      )
    : 0;

  const menteeJson = mentee.toJSON();
  const lastActive = menteeJson.menteeProfile?.lastActivityDate || mentee.lastLoginAt || null;

  res.status(200).json({
    success: true,
    message: 'Mentee profile retrieved successfully',
    statusCode: 200,
    data: {
      mentee: menteeJson,
      assignedMentor,
      coMentors,
      currentClan,
      enrollments: enrollmentRows,
      recentTasks: recentTaskRows,
      stats: {
        overallProgress,
        tasksCompleted,
        tasksTotal,
        points,
        lastActive,
        currentClanName: currentClan?.name || null,
      },
      // Back-compat alias for any existing consumer.
      activeEnrollments: enrollmentRows,
    },
  });
});

module.exports = { getAllMentees, getMenteeById };
