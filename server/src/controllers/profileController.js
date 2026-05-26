const { models } = require('../db');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors/errorTypes');
const { successResponse } = require('../utils/responses');
const { PROFILE_MESSAGES } = require('../utils/responses/messages');
const { catchAsync } = require('../middlewares/errorHandler');

class ProfileController {
  /**
   * Get current user's profile with role-specific data
   * GET /api/profile
   */
  getProfile = catchAsync(async (req, res) => {
    const userId = req.user.id;
    const user = await models.User.findByPk(userId, {
      attributes: { exclude: ['passwordHash'] },
      include: [
        {
          model: models.MentorProfile,
          as: 'mentorProfile',
          required: false
        },
        {
          model: models.MenteeProfile,
          as: 'menteeProfile',
          required: false
        },
        {
          model: models.Skill,
          as: 'skills',
          through: { attributes: ['proficiencyLevel', 'yearsOfExperience'] }
        }
      ]
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    res.json(successResponse('Profile retrieved successfully', user));
  });

  /**
   * Complete mentee profile during onboarding
   * POST /api/profile/complete-mentee
   */
  completeMenteeProfile = catchAsync(async (req, res) => {
    const userId = req.user.id;
   const { 
  currentEducation,
  currentOccupation,
  learningGoals,
  interests,
  priorExperience,
  preferredLearningStyle,
  linkedinUrl,
  githubUrl,
  portfolioUrl
} = req.body;

    // Verify user is a mentee
    const user = await models.User.findByPk(userId);
    if (user.role !== 'mentee') {
      throw new ForbiddenError('Only mentees can complete mentee profiles');
    }

    // Update mentee profile
   // Update or create mentee profile (auto-create if missing)
let menteeProfile = await models.MenteeProfile.findOne({ where: { userId } });
if (!menteeProfile) {
  // Auto-create if it doesn't exist (handles legacy users)
  menteeProfile = await models.MenteeProfile.create({
    userId,
    learningGoals: [],
    interests: [],
    currentEducation: null,
    currentOccupation: null,
    priorExperience: null,
    preferredLearningStyle: 'visual',
    currentLevel: 1,
    totalPoints: 0
  });
}

   await menteeProfile.update({
  currentEducation,
  currentOccupation,
  learningGoals: Array.isArray(learningGoals) ? learningGoals : [learningGoals],
  interests: Array.isArray(interests) ? interests : [interests],
  priorExperience,
  preferredLearningStyle,
  linkedinUrl,
  githubUrl,
  portfolioUrl
});

    // Update user onboarding status
  
await user.update({
  onboardingStep: 1,
  profileCompleted: true  // Profile IS complete; skills are optional
});

    res.json(successResponse(
      PROFILE_MESSAGES.PROFILE_UPDATED,
      { profile: menteeProfile, onboardingStep: 1 }
    ));
  });

  /**
   * Complete mentor profile during onboarding
   * POST /api/profile/complete-mentor
   */
  completeMentorProfile = catchAsync(async (req, res) => {
    const userId = req.user.id;
    const {
      title,
      organization,
      yearsOfExperience,
      specialization,
      linkedinUrl,
      githubUrl,
      portfolioUrl,
      maxMentees,
      preferredMenteeLevel,
      isAcceptingMentees,
      bio
    } = req.body;

    // Verify user is a mentor
    const user = await models.User.findByPk(userId);
    if (user.role !== 'mentor') {
      throw new ForbiddenError('Only mentors can complete mentor profiles');
    }

    // Update mentor profile
    const mentorProfile = await models.MentorProfile.findOne({ where: { userId } });
    if (!mentorProfile) {
      throw new NotFoundError('Mentor profile not found');
    }

    const updateData = {
      title,
      organization,
      yearsOfExperience: yearsOfExperience || 0,
      specialization: Array.isArray(specialization) ? specialization : [specialization],
      linkedinUrl,
      githubUrl,
      portfolioUrl,
      maxMentees: maxMentees || 5,
      preferredMenteeLevel: Array.isArray(preferredMenteeLevel) ? preferredMenteeLevel : [preferredMenteeLevel]
    };

    // Only update isAcceptingMentees if explicitly provided
    if (typeof isAcceptingMentees === 'boolean') {
      updateData.isAcceptingMentees = isAcceptingMentees;
    }

    await mentorProfile.update(updateData);

    // Update user bio if provided
    if (bio) {
      await user.update({ bio });
    }

    // Update user onboarding status
    await user.update({
      onboardingStep: 1,
      profileCompleted: false // Will be true after skills are added (step 2)
    });

    res.json(successResponse(
      PROFILE_MESSAGES.PROFILE_UPDATED,
      { profile: mentorProfile, onboardingStep: 1 }
    ));
  });

  /**
   * Add skills to user profile during onboarding
   * POST /api/profile/add-skills
   */
  addUserSkills = catchAsync(async (req, res) => {
    const userId = req.user.id;
    const { skills } = req.body; // Array of { skillId, proficiencyLevel, yearsOfExperience }

    if (!Array.isArray(skills) || skills.length === 0) {
      throw new ValidationError('Skills array is required');
    }

    // Validate skills exist
    const skillIds = skills.map(s => s.skillId);
    const existingSkills = await models.Skill.findAll({
      where: { id: skillIds }
    });

    if (existingSkills.length !== skillIds.length) {
      throw new ValidationError('One or more invalid skill IDs');
    }

    // Remove existing user skills
    await models.UserSkill.destroy({ where: { userId } });

    // Add new skills
    const userSkills = skills.map(skill => ({
      userId,
      skillId: skill.skillId,
      proficiencyLevel: skill.proficiencyLevel || 1,
      yearsOfExperience: skill.yearsOfExperience || 0
    }));

    await models.UserSkill.bulkCreate(userSkills);

    // Update user onboarding status
    const user = await models.User.findByPk(userId);
    await user.update({
      onboardingStep: 2,
      profileCompleted: true // Profile is now complete
    });

    res.json(successResponse(
      'Skills added successfully',
      { skills: userSkills, onboardingStep: 2, profileCompleted: true }
    ));
  });

  /**
   * Skip skills step (optional)
   * POST /api/profile/skip-skills
   */
  skipSkills = catchAsync(async (req, res) => {
    const userId = req.user.id;
    const user = await models.User.findByPk(userId);

    await user.update({
      onboardingStep: 2,
      profileCompleted: true
    });

    res.json(successResponse(
      'Onboarding completed',
      { onboardingStep: 2, profileCompleted: true }
    ));
  });

  /**
   * Update user profile
   * PUT /api/profile
   */
  updateProfile = catchAsync(async (req, res) => {
    const userId = req.user.id;
    const { firstName, lastName, bio, phone, profilePictureUrl } = req.body;

    const user = await models.User.findByPk(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    await user.update({
      firstName: firstName || user.firstName,
      lastName: lastName || user.lastName,
      bio: bio !== undefined ? bio : user.bio,
      phone: phone !== undefined ? phone : user.phone,
      profilePictureUrl: profilePictureUrl !== undefined ? profilePictureUrl : user.profilePictureUrl
    });

    res.json(successResponse(PROFILE_MESSAGES.PROFILE_UPDATED, user));
  });

  /**
   * Update mentor availability settings
   * PATCH /api/profile/mentor/availability
   */
  updateMentorAvailability = catchAsync(async (req, res) => {
    const userId = req.user.id;
    const { isAcceptingMentees, maxMentees } = req.body;

    // Verify user is a mentor
    const user = await models.User.findByPk(userId);
    if (user.role !== 'mentor') {
      throw new ForbiddenError('Only mentors can update availability settings');
    }

    const mentorProfile = await models.MentorProfile.findOne({ where: { userId } });
    if (!mentorProfile) {
      throw new NotFoundError('Mentor profile not found');
    }

    const updateData = {};
    
    if (typeof isAcceptingMentees === 'boolean') {
      updateData.isAcceptingMentees = isAcceptingMentees;
    }
    
    if (maxMentees !== undefined && maxMentees > 0) {
      updateData.maxMentees = maxMentees;
    }

    await mentorProfile.update(updateData);

    res.json(successResponse(
      'Availability settings updated successfully',
      { 
        isAcceptingMentees: mentorProfile.isAcceptingMentees,
        maxMentees: mentorProfile.maxMentees,
        currentMenteeCount: mentorProfile.currentMenteeCount
      }
    ));
  });
}

module.exports = new ProfileController();
