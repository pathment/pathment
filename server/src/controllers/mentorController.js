const { models } = require('../db');
const { Op } = require('sequelize');
const { catchAsync } = require('../middlewares/errorHandler');
const { NotFoundError } = require('../utils/errors/errorTypes');

/**
 * Get all active mentors
 */
const getAllMentors = catchAsync(async (req, res) => {
  const { search, page = 1, limit = 20, accepting } = req.query;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;

  const where = { role: 'mentor', status: 'active' };

  const searchConditions = search ? {
    [Op.or]: [
      { firstName: { [Op.iLike]: `%${search}%` } },
      { lastName: { [Op.iLike]: `%${search}%` } },
      { email: { [Op.iLike]: `%${search}%` } }
    ]
  } : {};

  // Build mentor profile include — optionally filter by accepting status
  const mentorProfileInclude = {
    model: models.MentorProfile,
    as: 'mentorProfile',
    attributes: [
      'specialization', 'maxMentees', 'currentMenteeCount', 'title', 'organization',
      'isAcceptingMentees', 'avgFeedbackRating', 'totalMenteesGuided', 'yearsOfExperience',
    ],
  };

  if (accepting === 'true' || accepting === 'false') {
    mentorProfileInclude.where = { isAcceptingMentees: accepting === 'true' };
    mentorProfileInclude.required = true;
  }

  const { count, rows: mentors } = await models.User.findAndCountAll({
    where: { ...where, ...searchConditions },
    attributes: ['id', 'firstName', 'lastName', 'email', 'createdAt'],
    include: [mentorProfileInclude],
    order: [['firstName', 'ASC']],
    limit: limitNum,
    offset,
    distinct: true,
  });

  res.status(200).json({
    status: 'success',
    data: { mentors },
    pagination: {
      page: pageNum,
      limit: limitNum,
      totalItems: count,
      totalPages: Math.ceil(count / limitNum),
    },
  });
});

/**
 * Get a single mentor's full profile (admin)
 */
const getMentorById = catchAsync(async (req, res) => {
  const { id } = req.params;

  const mentor = await models.User.findOne({
    where: { id, role: 'mentor' },
    attributes: ['id', 'firstName', 'lastName', 'email', 'profilePictureUrl', 'createdAt'],
    include: [
      {
        model: models.MentorProfile,
        as: 'mentorProfile',
        attributes: [
          'title', 'organization', 'yearsOfExperience',
          'specialization', 'linkedinUrl', 'githubUrl', 'portfolioUrl',
          'maxMentees', 'currentMenteeCount', 'avgResponseTimeHours',
          'totalMenteesGuided', 'successRate', 'avgFeedbackRating',
          'totalTasksReviewed', 'isAcceptingMentees', 'preferredMenteeLevel'
        ]
      },
      {
        model: models.Skill,
        as: 'skills',
        attributes: ['id', 'name', 'category'],
        through: { attributes: ['proficiencyLevel'] }
      }
    ]
  });

  if (!mentor) throw new NotFoundError('Mentor not found');

  // Fetch active matches (current mentees)
  const activeMatches = await models.MentorMenteeMatch.findAll({
    where: { mentorId: id, status: 'active' },
    include: [
      {
        model: models.User,
        as: 'mentee',
        attributes: ['id', 'firstName', 'lastName', 'email']
      },
      {
        model: models.Enrollment,
        as: 'enrollment',
        attributes: ['id', 'status', 'overallProgressPercentage'],
        include: [{
          model: models.Program,
          as: 'program',
          attributes: ['id', 'name']
        }]
      }
    ],
    limit: 20
  }).catch(() => []);  // graceful fallback if model not fully set up

  res.status(200).json({
    success: true,
    message: 'Mentor profile retrieved successfully',
    statusCode: 200,
    data: {
      mentor: mentor.toJSON(),
      activeMatches
    }
  });
});

module.exports = {
  getAllMentors,
  getMentorById
};
