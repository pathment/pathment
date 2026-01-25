const levelMentorService = require('../services/levelMentorService');
const { catchAsync } = require('../middlewares/errorHandler');

/**
 * Assign mentor to level
 */
const assignMentorToLevel = catchAsync(async (req, res) => {
  const { programId, levelId } = req.params;
  const { mentorId } = req.body;

  const assignment = await levelMentorService.assignMentorToLevel(programId, levelId, mentorId, req.user.id);

  res.status(201).json({
    status: 'success',
    data: {
      assignment
    }
  });
});

/**
 * Get mentors assigned to a level
 */
const getLevelMentors = catchAsync(async (req, res) => {
  const { programId, levelId } = req.params;

  const mentors = await levelMentorService.getLevelMentors(programId, levelId);

  res.status(200).json({
    status: 'success',
    data: {
      mentors
    }
  });
});

/**
 * Remove mentor from level
 */
const removeMentorFromLevel = catchAsync(async (req, res) => {
  const { programId, levelId, mentorId } = req.params;

  await levelMentorService.removeMentorFromLevel(programId, levelId, mentorId);

  res.status(200).json({
    status: 'success',
    message: 'Mentor removed from level successfully'
  });
});

/**
 * Get all mentor assignments for a program
 */
const getProgramMentorAssignments = catchAsync(async (req, res) => {
  const { programId } = req.params;

  const assignments = await levelMentorService.getProgramMentorAssignments(programId);

  res.status(200).json({
    status: 'success',
    data: {
      assignments
    }
  });
});

module.exports = {
  assignMentorToLevel,
  getLevelMentors,
  removeMentorFromLevel,
  getProgramMentorAssignments
};
