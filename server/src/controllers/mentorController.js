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
    attributes: ['id', 'firstName', 'lastName', 'email', 'status', 'createdAt'],
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

  // ── Live stats (stored columns are never updated so we compute them here) ──
  const allMatches = await models.MentorMenteeMatch.findAll({
    where: { mentorId: id },
    attributes: ['menteeSatisfactionRating'],
    include: [{
      model: models.Enrollment,
      as: 'enrollment',
      attributes: ['status'],
      required: false,
    }],
  }).catch(() => []);

  const totalMenteesGuided = allMatches.length;

  const completedCount = allMatches.filter(
    m => m.enrollment?.status === 'program_completed'
  ).length;

  const successRate = totalMenteesGuided > 0
    ? parseFloat(((completedCount / totalMenteesGuided) * 100).toFixed(1))
    : 0;

  const ratedMatches = allMatches.filter(m => m.menteeSatisfactionRating != null);
  const avgFeedbackRating = ratedMatches.length > 0
    ? parseFloat(
        (ratedMatches.reduce((sum, m) => sum + parseFloat(m.menteeSatisfactionRating), 0) / ratedMatches.length).toFixed(1)
      )
    : null;

  // Fetch active matches — match must be active AND enrollment must not be terminated.
  // Matches are sometimes left in 'active' state even after the enrollment reaches
  // program_completed or dropped, so we exclude those enrollment statuses explicitly.
  const TERMINAL_ENROLLMENT_STATUSES = ['program_completed', 'dropped', 'rejected', 'withdrawn'];

  const activeMatches = await models.MentorMenteeMatch.findAll({
    attributes: ['id', 'status', 'matchedAt'],
    where: { mentorId: id, status: 'active' },
    include: [
      {
        model: models.User,
        as: 'mentee',
        attributes: ['id', 'firstName', 'lastName', 'email'],
      },
      {
        model: models.Enrollment,
        as: 'enrollment',
        attributes: ['id', 'status', 'overallProgressPercentage'],
        where: { status: { [Op.notIn]: TERMINAL_ENROLLMENT_STATUSES } },
        required: true,
        include: [{
          model: models.Program,
          as: 'program',
          attributes: ['id', 'name'],
        }],
      },
    ],
    order: [['matchedAt', 'DESC']],
    limit: 20,
  }).catch(() => []);

  const mentorJson = mentor.toJSON();
  // Override stale stored stats with live-computed values
  if (mentorJson.mentorProfile) {
    mentorJson.mentorProfile.totalMenteesGuided = totalMenteesGuided;
    mentorJson.mentorProfile.successRate = successRate;
    mentorJson.mentorProfile.avgFeedbackRating = avgFeedbackRating;
  }

  res.status(200).json({
    success: true,
    message: 'Mentor profile retrieved successfully',
    statusCode: 200,
    data: {
      mentor: mentorJson,
      activeMatches
    }
  });
});

module.exports = {
  getAllMentors,
  getMentorById
};
