const { models } = require('../db');
const { NotFoundError, BadRequestError } = require('../utils/errors/errorTypes');

/**
 * Assign a mentor to a program level
 */
const assignMentorToLevel = async (programId, levelId, mentorId, assignedBy) => {
  // Verify level belongs to program
  const level = await models.ProgramLevel.findOne({
    where: { id: levelId, programId }
  });

  if (!level) {
    throw new NotFoundError('Level not found in this program');
  }

  // Verify mentor exists and has mentor role
  const mentor = await models.User.findOne({
    where: { id: mentorId, role: 'mentor', status: 'active' }
  });

  if (!mentor) {
    throw new NotFoundError('Active mentor not found');
  }

  // Check if assignment already exists
  const existingAssignment = await models.LevelMentorAssignment.findOne({
    where: { levelId, mentorId }
  });

  if (existingAssignment) {
    if (existingAssignment.isActive) {
      throw new BadRequestError('Mentor is already assigned to this level');
    }
    // Reactivate the assignment
    existingAssignment.isActive = true;
    existingAssignment.assignedBy = assignedBy;
    existingAssignment.assignedAt = new Date();
    await existingAssignment.save();
    return existingAssignment;
  }

  // Create new assignment
  const assignment = await models.LevelMentorAssignment.create({
    levelId,
    mentorId,
    assignedBy,
    isActive: true
  });

  return assignment;
};

/**
 * Get all mentors assigned to a level
 */
const getLevelMentors = async (programId, levelId) => {
  // Verify level belongs to program
  const level = await models.ProgramLevel.findOne({
    where: { id: levelId, programId }
  });

  if (!level) {
    throw new NotFoundError('Level not found in this program');
  }

  const assignments = await models.LevelMentorAssignment.findAll({
    where: { levelId, isActive: true },
    include: [{
      model: models.User,
      as: 'mentor',
      attributes: ['id', 'firstName', 'lastName', 'email'],
      include: [{
        model: models.MentorProfile,
        as: 'mentorProfile',
        attributes: ['specialization', 'maxMentees', 'title', 'organization', 'yearsOfExperience']
      }]
    }]
  });

  return assignments.map(a => a.mentor);
};

/**
 * Remove mentor from level (soft delete)
 */
const removeMentorFromLevel = async (programId, levelId, mentorId) => {
  // Verify level belongs to program
  const level = await models.ProgramLevel.findOne({
    where: { id: levelId, programId }
  });

  if (!level) {
    throw new NotFoundError('Level not found in this program');
  }

  const assignment = await models.LevelMentorAssignment.findOne({
    where: { levelId, mentorId, isActive: true }
  });

  if (!assignment) {
    throw new NotFoundError('Mentor assignment not found');
  }

  assignment.isActive = false;
  await assignment.save();

  return assignment;
};

/**
 * Get all mentor assignments for a program (grouped by level)
 */
const getProgramMentorAssignments = async (programId) => {
  const program = await models.Program.findByPk(programId);

  if (!program) {
    throw new NotFoundError('Program not found');
  }

  const levels = await models.ProgramLevel.findAll({
    where: { programId },
    order: [['levelOrder', 'ASC']],
    include: [{
      model: models.LevelMentorAssignment,
      as: 'mentorAssignments',
      where: { isActive: true },
      required: false,
      include: [{
        model: models.User,
        as: 'mentor',
        attributes: ['id', 'firstName', 'lastName', 'email'],
        include: [{
          model: models.MentorProfile,
          as: 'mentorProfile',
          attributes: ['specialization', 'maxMentees', 'title', 'organization', 'yearsOfExperience']
        }]
      }]
    }]
  });

  return levels.map(level => ({
    level: {
      id: level.id,
      name: level.name,
      order: level.order
    },
    mentors: level.mentorAssignments?.map(a => a.mentor) || []
  }));
};

module.exports = {
  assignMentorToLevel,
  getLevelMentors,
  removeMentorFromLevel,
  getProgramMentorAssignments
};
