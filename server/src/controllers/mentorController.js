const { models } = require('../db');
const { catchAsync } = require('../middlewares/errorHandler');

/**
 * Get all active mentors
 */
const getAllMentors = catchAsync(async (req, res) => {
  const { search } = req.query;
  
  const where = { role: 'mentor', status: 'active' };
  
  // Add search filter if provided
  const searchConditions = search ? {
    [models.Sequelize.Op.or]: [
      { firstName: { [models.Sequelize.Op.iLike]: `%${search}%` } },
      { lastName: { [models.Sequelize.Op.iLike]: `%${search}%` } },
      { email: { [models.Sequelize.Op.iLike]: `%${search}%` } }
    ]
  } : {};

  const mentors = await models.User.findAll({
    where: { ...where, ...searchConditions },
    attributes: ['id', 'firstName', 'lastName', 'email'],
    include: [{
      model: models.MentorProfile,
      as: 'mentorProfile',
      attributes: ['specialization', 'maxMentees', 'currentMenteeCount', 'title', 'organization']
    }],
    order: [['firstName', 'ASC']]
  });

  res.status(200).json({
    status: 'success',
    data: {
      mentors
    }
  });
});

module.exports = {
  getAllMentors
};
