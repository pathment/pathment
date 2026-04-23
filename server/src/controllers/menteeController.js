const { models } = require('../db');
const { Op } = require('sequelize');
const { catchAsync } = require('../middlewares/errorHandler');
const { NotFoundError } = require('../utils/errors/errorTypes');

/**
 * GET /mentees
 * List all registered mentees with profile stats (admin only)
 */
const getAllMentees = catchAsync(async (req, res) => {
  const { search, page = 1, limit = 20 } = req.query;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;

  const where = { role: 'mentee', status: 'active' };

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
    attributes: ['id', 'firstName', 'lastName', 'email', 'createdAt'],
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

  res.status(200).json({
    status: 'success',
    data: { mentees },
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
