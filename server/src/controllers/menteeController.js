const { models } = require('../db');
const { Op } = require('sequelize');
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
    attributes: ['id', 'firstName', 'lastName', 'email', 'status', 'createdAt'],
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
    attributes: ['id', 'firstName', 'lastName', 'email', 'profilePictureUrl', 'createdAt'],
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

  // Fetch recent enrollments with matched mentor info
  const activeEnrollments = await models.Enrollment.findAll({
    where: { menteeId: id },
    include: [
      {
        model: models.Program,
        as: 'program',
        attributes: ['id', 'name', 'type'],
      },
      {
        model: models.MentorMenteeMatch,
        as: 'matches',
        where: { status: 'active' },
        required: false,
        include: [
          {
            model: models.User,
            as: 'mentor',
            attributes: ['id', 'firstName', 'lastName', 'email'],
          },
        ],
      },
    ],
    order: [['enrolledAt', 'DESC']],
    limit: 20,
  }).catch(() => []);

  res.status(200).json({
    success: true,
    message: 'Mentee profile retrieved successfully',
    statusCode: 200,
    data: {
      mentee: mentee.toJSON(),
      activeEnrollments,
    },
  });
});

module.exports = { getAllMentees, getMenteeById };
