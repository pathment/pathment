const { models } = require('../db');
const { NotFoundError, ValidationError, ConflictError, ForbiddenError } = require('../utils/errors/errorTypes');

class MatchingService {
  async createMatch(enrollmentId, mentorId, levelId, matchedBy) {
    // Validate enrollment
    const enrollment = await models.Enrollment.findByPk(enrollmentId, {
      include: [{
        model: models.User,
        as: 'mentee',
        include: [{ model: models.MenteeProfile, as: 'menteeProfile' }]
      }]
    });

    if (!enrollment) {
      throw new NotFoundError('Enrollment not found');
    }

    // Validate mentor
    const mentor = await models.User.findByPk(mentorId, {
      include: [{ model: models.MentorProfile, as: 'mentorProfile' }]
    });

    if (!mentor || mentor.role !== 'mentor') {
      throw new NotFoundError('Mentor not found');
    }

    // Check mentor capacity
    const currentMatches = await models.MentorMenteeMatch.count({
      where: { mentorId, status: 'active' }
    });

    if (mentor.mentorProfile && currentMatches >= mentor.mentorProfile.maxMentees) {
      throw new ValidationError('Mentor has reached maximum capacity');
    }

    // Create match
    const match = await models.MentorMenteeMatch.create({
      mentorId,
      menteeId: enrollment.menteeId,
      enrollmentId,
      levelId,
      matchedBy,
      status: 'active',
      matchedAt: new Date()
    });

    // Update enrollment status
    await enrollment.update({ status: 'matched' });

    return models.MentorMenteeMatch.findByPk(match.id, {
      include: [
        { model: models.User, as: 'mentor', attributes: ['id', 'firstName', 'lastName', 'email'] },
        { model: models.User, as: 'mentee', attributes: ['id', 'firstName', 'lastName', 'email'] },
        { model: models.Enrollment, as: 'enrollment' },
        { model: models.ProgramLevel, as: 'level' }
      ]
    });
  }

  async getAISuggestions(enrollmentId) {
    const enrollment = await models.Enrollment.findByPk(enrollmentId, {
      include: [
        {
          model: models.User,
          as: 'mentee',
          include: [{ model: models.MenteeProfile, as: 'menteeProfile' }]
        },
        {
          model: models.ProgramLevel,
          as: 'currentLevel'
        }
      ]
    });

    if (!enrollment) {
      throw new NotFoundError('Enrollment not found');
    }

    // Get mentors assigned to this level
    const levelMentors = await this.getLevelMentors(enrollment.currentLevelId);

    // Simple scoring algorithm - use learningGoals instead of skills
    const menteeLearningGoals = enrollment.mentee.menteeProfile?.learningGoals || [];
    const menteeInterests = enrollment.mentee.menteeProfile?.interests || [];
    const menteeSkills = [...menteeLearningGoals, ...menteeInterests];
    
    const suggestions = levelMentors.map(mentorData => {
      const mentorSpecialization = mentorData.mentorProfile?.specialization || [];
      
      // Calculate skill match score
      const matchingSkills = menteeSkills.filter(skill => 
        mentorSpecialization.some(spec => spec.toLowerCase().includes(skill.toLowerCase()))
      );
      
      const skillScore = menteeSkills.length > 0 
        ? (matchingSkills.length / menteeSkills.length) * 100 
        : 50;

      // Calculate capacity score (prefer mentors with more availability)
      const capacityScore = mentorData.mentorProfile 
        ? ((mentorData.mentorProfile.maxMentees - mentorData.currentMentees) / mentorData.mentorProfile.maxMentees) * 100
        : 50;

      // Overall match score (70% skills, 30% capacity)
      const matchScore = (skillScore * 0.7) + (capacityScore * 0.3);

      return {
        mentor: {
          id: mentorData.id,
          firstName: mentorData.firstName,
          lastName: mentorData.lastName,
          email: mentorData.email,
          mentorProfile: mentorData.mentorProfile
        },
        level: enrollment.currentLevel,
        currentMentees: mentorData.currentMentees,
        assignmentId: mentorData.assignmentId,
        matchScore: Math.round(matchScore),
        matchReason: `${matchingSkills.length} skill matches, ${mentorData.mentorProfile?.maxMentees - mentorData.currentMentees || 0} slots available`
      };
    });

    // Sort by match score
    return suggestions.sort((a, b) => b.matchScore - a.matchScore);
  }

  async getLevelMentors(levelId) {
    const assignments = await models.LevelMentorAssignment.findAll({
      where: { levelId, isActive: true },
      include: [
        {
          model: models.User,
          as: 'mentor',
          include: [{ model: models.MentorProfile, as: 'mentorProfile' }]
        }
      ]
    });

    const mentors = await Promise.all(assignments.map(async (assignment) => {
      const currentMentees = await models.MentorMenteeMatch.count({
        where: { 
          mentorId: assignment.mentor.id, 
          status: 'active' 
        }
      });

      return {
        ...assignment.mentor.toJSON(),
        currentMentees,
        assignmentId: assignment.id
      };
    }));

    return mentors;
  }

  async getMatches(filters) {
    const where = {};
    if (filters.status) where.status = filters.status;
    if (filters.mentorId) where.mentorId = filters.mentorId;
    if (filters.menteeId) where.menteeId = filters.menteeId;
    if (filters.enrollmentId) where.enrollmentId = filters.enrollmentId;

    return models.MentorMenteeMatch.findAll({
      where,
      include: [
        { model: models.User, as: 'mentor', attributes: ['id', 'firstName', 'lastName', 'email'] },
        { model: models.User, as: 'mentee', attributes: ['id', 'firstName', 'lastName', 'email'] },
        { model: models.Enrollment, as: 'enrollment' },
        { model: models.ProgramLevel, as: 'level' }
      ],
      order: [['matchedAt', 'DESC']]
    });
  }

  async updateMatchStatus(matchId, status, userId, userRole) {
    const match = await models.MentorMenteeMatch.findByPk(matchId);

    if (!match) {
      throw new NotFoundError('Match not found');
    }

    if (userRole !== 'admin' && match.mentorId !== userId && match.menteeId !== userId) {
      throw new ForbiddenError('Not authorized to update this match');
    }

    const validStatuses = ['pending', 'active', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      throw new ValidationError('Invalid status');
    }

    await match.update({ status });
    return match;
  }
}

module.exports = new MatchingService();
