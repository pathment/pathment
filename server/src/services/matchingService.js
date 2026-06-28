const { models } = require('../db');
const { NotFoundError, ValidationError, ConflictError, ForbiddenError } = require('../utils/errors/errorTypes');
const { Op, col } = require('sequelize');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const groqService = require('./groqService');

class MatchingService {
  /**
   * Update mentor's current mentee count based on unique active mentees
   * This should be called whenever a match is created, updated, or deleted
   */
  async updateMentorMenteeCount(mentorId) {
    // Count unique active mentees for this mentor
    const uniqueMentees = await models.MentorMenteeMatch.findAll({
      where: { 
        mentorId, 
        status: 'active' 
      },
      attributes: ['menteeId'],
      group: ['menteeId'],
      raw: true
    });

    const currentMenteeCount = uniqueMentees.length;

    // Update mentor profile
    await models.MentorProfile.update(
      { currentMenteeCount },
      { where: { userId: mentorId } }
    );

    return currentMenteeCount;
  }

  async createMatch(enrollmentId, mentorId, matchedBy) {
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

    // Check mentor capacity - count unique active mentees, not total matches
    const uniqueActiveMentees = await models.MentorMenteeMatch.findAll({
      where: { 
        mentorId, 
        status: 'active' 
      },
      attributes: ['menteeId'],
      group: ['menteeId'],
      raw: true
    });

    const currentMenteeCount = uniqueActiveMentees.length;

    if (mentor.mentorProfile && currentMenteeCount >= mentor.mentorProfile.maxMentees) {
      throw new ValidationError(
        `Mentor has reached maximum capacity (${mentor.mentorProfile.maxMentees} mentees). Currently mentoring ${currentMenteeCount} unique mentees.`
      );
    }

    // Create match
    const match = await models.MentorMenteeMatch.create({
      mentorId,
      menteeId: enrollment.menteeId,
      enrollmentId,
      matchedBy,
      status: 'active',
      matchedAt: new Date()
    });

    // Update enrollment status
    await enrollment.update({ status: 'matched' });

    // Update mentor's current mentee count
    await this.updateMentorMenteeCount(mentorId);

    // Initialize enrollment task stats so tasksTotal reflects the full program
    // scope from day 1, then auto-assign week 1 tasks for the current level.
    const taskService = require('./taskService');
    await taskService.updateEnrollmentTaskStats(enrollmentId);
    // Onboarding is fully mentor-driven: the mentor assigns roadmaps/tasks
    // after matching. (Legacy week-curriculum auto-assignment was removed.)
    const hydratedMatch = await models.MentorMenteeMatch.findByPk(match.id, {
      include: [
        { model: models.User, as: 'mentor', attributes: ['id', 'firstName', 'lastName', 'email'] },
        { model: models.User, as: 'mentee', attributes: ['id', 'firstName', 'lastName', 'email'] },
        { model: models.Enrollment, as: 'enrollment', include: [{ model: models.Program, as: 'program', attributes: ['name'] }] }
      ]
    });

    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.MENTOR_ASSIGNED,
      recipients: [{ userId: hydratedMatch.mentorId }],
      payload: {
        title: 'New mentee assigned',
        message: `You have been matched in "${hydratedMatch.enrollment?.program?.name || 'a program'}".`,
        actionUrl: `/mentor/mentees`,
        actionLabel: 'Open Mentees',
        relatedEntityType: 'mentor_match',
        relatedEntityId: hydratedMatch.id,
        emailSubject: 'Pathment: New mentee assignment'
      },
      dedupe: {
        relatedEntityType: 'mentor_assigned',
        relatedEntityId: hydratedMatch.id
      }
    });

    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.MENTOR_ASSIGNED,
      recipients: [{ userId: hydratedMatch.menteeId }],
      payload: {
        title: 'Mentor assigned',
        message: `A mentor has been assigned in "${hydratedMatch.enrollment?.program?.name || 'your program'}".`,
        actionUrl: `/mentee/programs`,
        actionLabel: 'View Program',
        relatedEntityType: 'mentor_match',
        relatedEntityId: hydratedMatch.id,
        emailSubject: 'Pathment: Mentor assigned to your enrollment'
      },
      dedupe: {
        relatedEntityType: 'mentor_assigned',
        relatedEntityId: hydratedMatch.id
      }
    });

    return hydratedMatch;
  }

  async getAISuggestions(enrollmentId) {
    const enrollment = await models.Enrollment.findByPk(enrollmentId, {
      include: [
        {
          model: models.User,
          as: 'mentee',
          include: [
            { model: models.MenteeProfile, as: 'menteeProfile' },
            {
              model: models.Skill,
              as: 'skills',
              through: { attributes: ['proficiencyLevel', 'yearsOfExperience'] }
            }
          ]
        },
        { model: models.Program, as: 'program' }
      ]
    });

    if (!enrollment) {
      throw new NotFoundError('Enrollment not found');
    }

    // Candidate pool = all active mentors (level-based gating was removed).
    const levelMentorIds = (await this.getCandidateMentors()).map(m => m.id);
    if (levelMentorIds.length === 0) return [];

    const mentorUsers = await models.User.findAll({
      where: { id: levelMentorIds },
      include: [
        { model: models.MentorProfile, as: 'mentorProfile' },
        {
          model: models.Skill,
          as: 'skills',
          through: { attributes: ['proficiencyLevel', 'yearsOfExperience'] }
        }
      ]
    });

    const menteeProfileData = enrollment.mentee.menteeProfile;
    const menteeSkillNames = (enrollment.mentee.skills || []).map(s => s.name);

    // Build the mentee payload once
    const menteePayload = {
      learningGoals: menteeProfileData?.learningGoals || [],
      interests: menteeProfileData?.interests || [],
      skills: menteeSkillNames,
      learningStyle: menteeProfileData?.preferredLearningStyle || 'Not specified',
      priorExperience: menteeProfileData?.priorExperience || ''
    };

    const programRequirements = {
      skills: (enrollment.program?.learningOutcomes || []),
      level: enrollment.program?.name || 'Not specified'
    };

    // Build mentor payloads and fire a single batch AI call
    const mentorPayloads = mentorUsers.map(mentor => ({
      id: mentor.id,
      skills: (mentor.skills || []).map(s => s.name),
      yearsExperience: mentor.mentorProfile?.yearsOfExperience || 0,
      specialization: (mentor.mentorProfile?.specialization || []).join(', '),
      currentMentees: mentor.mentorProfile?.currentMenteeCount || 0,
      maxMentees: mentor.mentorProfile?.maxMentees || 5,
      successRate: mentor.mentorProfile?.successRate || 0
    }));

    const aiResults = await groqService.batchGenerateMatchingScores(
      mentorPayloads,
      menteePayload,
      programRequirements
    );

    const scoreMap = new Map(aiResults.map(r => [r.mentorId, r]));

    const suggestions = mentorUsers.map(mentor => {
      const aiResult = scoreMap.get(mentor.id) || { score: 0, reasoning: '', strengths: [], concerns: [], breakdown: {} };
      return {
        mentor: {
          id: mentor.id,
          firstName: mentor.firstName,
          lastName: mentor.lastName,
          email: mentor.email,
          profilePictureUrl: mentor.profilePictureUrl || null,
          mentorProfile: mentor.mentorProfile
        },
        program: enrollment.program,
        currentMentees: mentor.mentorProfile?.currentMenteeCount || 0,
        matchScore: aiResult.score,
        matchReason: aiResult.reasoning || '',
        strengths: aiResult.strengths || [],
        concerns: aiResult.concerns || [],
        breakdown: aiResult.breakdown || {}
      };
    });

    return suggestions.sort((a, b) => b.matchScore - a.matchScore);
  }

  /** Candidate mentors for matching - all active mentors (no level gating). */
  async getCandidateMentors() {
    const mentors = await models.User.findAll({
      where: { role: 'mentor' },
      include: [{ model: models.MentorProfile, as: 'mentorProfile' }]
    });

    return mentors.map((m) => ({
      ...m.toJSON(),
      currentMentees: m.mentorProfile?.currentMenteeCount || 0
    }));
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
        { 
          model: models.User, 
          as: 'mentee', 
          attributes: ['id', 'firstName', 'lastName', 'email'],
          include: [{ model: models.MenteeProfile, as: 'menteeProfile' }]
        },
        {
          model: models.Enrollment,
          as: 'enrollment',
          include: [
            { model: models.Program, as: 'program' }
          ]
        }
      ],
      order: [['matchedAt', 'DESC']]
    });
  }

  /**
   * Programs a mentor is working in, derived from their ACTIVE matches. Grouped
   * by program for the frontend's program dropdowns. (Levels were removed; the
   * `levels` array is kept empty for backward-compatible response shape.)
   */
  async getMentorAssignedLevels(mentorId) {
    const matches = await models.MentorMenteeMatch.findAll({
      where: { mentorId, status: 'active' },
      include: [
        {
          model: models.Enrollment,
          as: 'enrollment',
          include: [{ model: models.Program, as: 'program', attributes: ['id', 'name', 'type', 'status'] }]
        }
      ]
    });

    const programMap = new Map();
    for (const m of matches) {
      const program = m.enrollment?.program;
      if (!program) continue;
      if (!programMap.has(program.id)) {
        programMap.set(program.id, {
          id: program.id, name: program.name, type: program.type, status: program.status, levels: []
        });
      }
    }

    return Array.from(programMap.values());
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

    const oldStatus = match.status;
    await match.update({ status });

    // Update mentor's mentee count if status changed to/from active
    if (oldStatus !== status && (status === 'active' || oldStatus === 'active')) {
      await this.updateMentorMenteeCount(match.mentorId);
    }

    return match;
  }

  /**
   * AI MATCHING HELPER METHODS
   * Get comprehensive mentee data for AI matching algorithm
   */
  async getMenteeMatchingProfile(menteeId) {
    const mentee = await models.User.findByPk(menteeId, {
      attributes: ['id', 'firstName', 'lastName', 'email', 'createdAt'],
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
            'avgTaskRating'
          ]
        },
        {
          model: models.Skill,
          as: 'skills',
          through: {
            model: models.UserSkill,
            attributes: ['proficiencyLevel', 'yearsOfExperience']
          },
          attributes: ['id', 'name', 'category']
        }
      ]
    });

    if (!mentee) {
      throw new NotFoundError('Mentee not found');
    }

    // Get active enrollments
    const enrollments = await models.Enrollment.findAll({
      where: {
        menteeId,
        status: { [Op.in]: ['pending_match', 'active', 'in_progress'] }
      },
      include: [
        {
          model: models.Program,
          as: 'program',
          attributes: ['id', 'name', 'type', 'targetAudience']
        }
      ]
    });

    return {
      id: mentee.id,
      name: `${mentee.firstName} ${mentee.lastName}`,
      profile: mentee.menteeProfile,
      skills: mentee.skills.map(skill => ({
        id: skill.id,
        name: skill.name,
        category: skill.category,
        proficiencyLevel: skill.UserSkill.proficiencyLevel,
        yearsOfExperience: skill.UserSkill.yearsOfExperience
      })),
      enrollments: enrollments.map(e => ({
        programId: e.programId,
        programName: e.program.name,
        programType: e.program.type,
        status: e.status
      }))
    };
  }

  /**
   * Get comprehensive mentor data for AI matching
   */
  async getMentorMatchingProfiles(mentorId = null) {
    const where = mentorId ? { id: mentorId } : {};

    const mentors = await models.User.findAll({
      where: {
        ...where,
        role: 'mentor'
      },
      attributes: ['id', 'firstName', 'lastName', 'email', 'bio'],
      include: [
        {
          model: models.MentorProfile,
          as: 'mentorProfile',
          where: {
            isAcceptingMentees: true,
            currentMenteeCount: {
              [Op.lt]: col('mentorProfile.max_mentees')
            }
          },
          required: true,
          attributes: [
            'title',
            'organization',
            'yearsOfExperience',
            'specialization',
            'maxMentees',
            'currentMenteeCount',
            'preferredMenteeLevel',
            'avgFeedbackRating',
            'totalMenteesGuided',
            'successRate',
            'avgResponseTimeHours'
          ]
        },
        {
          model: models.Skill,
          as: 'skills',
          through: {
            model: models.UserSkill,
            attributes: ['proficiencyLevel', 'yearsOfExperience']
          },
          attributes: ['id', 'name', 'category']
        }
      ]
    });

    return mentors.map(mentor => ({
      id: mentor.id,
      name: `${mentor.firstName} ${mentor.lastName}`,
      bio: mentor.bio,
      profile: mentor.mentorProfile,
      skills: mentor.skills.map(skill => ({
        id: skill.id,
        name: skill.name,
        category: skill.category,
        proficiencyLevel: skill.UserSkill.proficiencyLevel,
        yearsOfExperience: skill.UserSkill.yearsOfExperience
      })),
      availability: mentor.mentorProfile.maxMentees - mentor.mentorProfile.currentMenteeCount,
      rating: mentor.mentorProfile.avgFeedbackRating,
      successRate: mentor.mentorProfile.successRate
    }));
  }

  /**
   * Calculate basic match score between mentee and mentor
   * This provides data for AI matching algorithms
   */
  calculateBasicMatchScore(menteeProfile, mentorProfile) {
    let score = 0;
    const reasons = [];

    // 1. Skill overlap (40% weight)
    const menteeSkillIds = new Set(menteeProfile.skills.map(s => s.id));
    const mentorSkillIds = new Set(mentorProfile.skills.map(s => s.id));
    const commonSkills = [...menteeSkillIds].filter(id => mentorSkillIds.has(id));
    const skillOverlapScore = (commonSkills.length / Math.max(menteeSkillIds.size, 1)) * 40;
    score += skillOverlapScore;
    
    if (commonSkills.length > 0) {
      reasons.push(`${commonSkills.length} overlapping skills`);
    }

    // 2. Specialization match (30% weight)
    const menteeInterests = menteeProfile.profile?.interests || [];
    const mentorSpecializations = mentorProfile.profile?.specialization || [];
    let specializationMatches = 0;
    
    menteeInterests.forEach(interest => {
      mentorSpecializations.forEach(spec => {
        if (spec.toLowerCase().includes(interest.toLowerCase()) || 
            interest.toLowerCase().includes(spec.toLowerCase())) {
          specializationMatches++;
        }
      });
    });
    
    const specializationScore = Math.min(specializationMatches * 10, 30);
    score += specializationScore;
    
    if (specializationMatches > 0) {
      reasons.push(`Matching specialization areas`);
    }

    // 3. Mentor quality metrics (20% weight)
    const mentorRating = mentorProfile.rating || 0;
    const mentorSuccessRate = mentorProfile.successRate || 0;
    const qualityScore = ((mentorRating / 5) * 10) + ((mentorSuccessRate / 100) * 10);
    score += qualityScore;
    
    if (mentorRating >= 4) {
      reasons.push(`High mentor rating (${mentorRating.toFixed(1)}/5)`);
    }

    // 4. Availability (10% weight)
    const availabilityScore = (mentorProfile.availability / mentorProfile.profile.maxMentees) * 10;
    score += availabilityScore;
    
    if (mentorProfile.availability > 0) {
      reasons.push(`Currently available for mentees`);
    }

    return {
      score: Math.min(score, 100).toFixed(2),
      reasons: reasons.length > 0 ? reasons : ['Basic compatibility'],
      breakdown: {
        skillOverlap: skillOverlapScore.toFixed(2),
        specialization: specializationScore.toFixed(2),
        quality: qualityScore.toFixed(2),
        availability: availabilityScore.toFixed(2)
      }
    };
  }

  /**
   * Auto-match all pending enrollments using AI suggestions.
   * Takes the top-scored mentor for each pending_match enrollment.
   *
   * @param {string|null} programId  - optionally scope to a single program
   * @param {string}      matchedBy  - admin user id performing the action
   * @returns {{ matched, skipped, failed, summary }}
   */
  async autoMatchPending(programId, matchedBy) {
    const whereClause = { status: 'pending_match' };
    if (programId) whereClause.programId = programId;

    const enrollments = await models.Enrollment.findAll({
      where: whereClause,
      include: [
        {
          model: models.User,
          as: 'mentee',
          include: [{ model: models.MenteeProfile, as: 'menteeProfile' }]
        }
      ]
    });

    const results = { matched: [], skipped: [], failed: [] };

    for (const enrollment of enrollments) {
      const menteeName = `${enrollment.mentee?.firstName} ${enrollment.mentee?.lastName}`.trim();

      try {
        const suggestions = await this.getAISuggestions(enrollment.id);

        if (!suggestions || suggestions.length === 0) {
          results.skipped.push({
            enrollmentId: enrollment.id,
            menteeName,
            reason: 'No mentor suggestions available for this enrollment'
          });
          continue;
        }

        const top = suggestions[0];
        const match = await this.createMatch(
          enrollment.id,
          top.mentor.id,
          matchedBy
        );

        results.matched.push({
          enrollmentId: enrollment.id,
          menteeName,
          mentorName: `${top.mentor.firstName} ${top.mentor.lastName}`.trim(),
          matchScore: top.matchScore,
          matchId: match.id
        });
      } catch (err) {
        results.failed.push({
          enrollmentId: enrollment.id,
          menteeName,
          reason: err.message
        });
      }
    }

    return {
      results,
      summary: {
        total: enrollments.length,
        matched: results.matched.length,
        skipped: results.skipped.length,
        failed: results.failed.length
      }
    };
  }

  /**
   * Find best mentor matches for a mentee
   * Used by AI matching system
   */
  async findMentorMatches(menteeId, limit = 5) {
    // Get mentee profile
    const menteeProfile = await this.getMenteeMatchingProfile(menteeId);

    // Get available mentors
    const mentors = await this.getMentorMatchingProfiles();

    // Calculate match scores
    const matches = mentors.map(mentor => {
      const matchResult = this.calculateBasicMatchScore(menteeProfile, mentor);
      return {
        mentor,
        matchScore: parseFloat(matchResult.score),
        matchReasons: matchResult.reasons,
        breakdown: matchResult.breakdown
      };
    });

    // Sort by score and return top matches
    matches.sort((a, b) => b.matchScore - a.matchScore);

    return {
      mentee: menteeProfile,
      topMatches: matches.slice(0, limit)
    };
  }
}

module.exports = new MatchingService();
