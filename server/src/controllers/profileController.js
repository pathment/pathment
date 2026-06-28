const { models } = require('../db');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors/errorTypes');
const { successResponse } = require('../utils/responses');
const { PROFILE_MESSAGES } = require('../utils/responses/messages');
const { catchAsync } = require('../middlewares/errorHandler');
const { uploadToCloudinary, deleteFromCloudinary, extractPublicId } = require('../utils/cloudinaryUpload');

// Profile photos are strictly PNG / JPG (the cropper exports one of these).
const ALLOWED_IMAGE_MIME = ['image/png', 'image/jpeg', 'image/jpg'];
const PROFILE_FOLDER = 'pathment/profiles';

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
        },
        {
          model: models.UserSettings,
          as: 'settings',
          required: false,
          attributes: ['timezone', 'language', 'theme', 'colorTheme', 'preferences']
        }
      ]
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const out = user.toJSON();
    // The stored mentor_profiles.current_mentee_count only ever tracked legacy
    // 1:1 matches, so it reads 0 for clan-based mentors. Show the REAL cohort
    // size (clans + matches) so "X of Y mentees" matches the My Mentees page.
    if (out.mentorProfile) {
      try {
        const cohortService = require('../services/cohortService');
        const ids = await cohortService.resolveMenteeIds(userId);
        out.mentorProfile.currentMenteeCount = ids.length;
      } catch { /* fall back to the stored value */ }
    }

    res.json(successResponse('Profile retrieved successfully', out));
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
      maxMentees: maxMentees || 100,
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
    const { firstName, lastName, bio, phone, profilePictureUrl, city, country, languages, timezone } = req.body;

    // Phone (optional) must look like a real phone, not free text.
    if (phone !== undefined && phone !== null && String(phone).trim()) {
      const v = String(phone).trim();
      const digits = v.replace(/\D/g, '');
      if (!/^[+(]?[\d\s().+-]+$/.test(v) || digits.length < 7 || digits.length > 15) {
        throw new ValidationError('Enter a valid phone number');
      }
    }

    const user = await models.User.findByPk(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    await user.update({
      firstName: firstName || user.firstName,
      lastName: lastName || user.lastName,
      bio: bio !== undefined ? bio : user.bio,
      phone: phone !== undefined ? phone : user.phone,
      profilePictureUrl: profilePictureUrl !== undefined ? profilePictureUrl : user.profilePictureUrl,
      city: city !== undefined ? city : user.city,
      country: country !== undefined ? country : user.country,
      languages: Array.isArray(languages)
        ? languages.map((l) => String(l).trim()).filter(Boolean)
        : user.languages
    });

    // Timezone lives on user_settings - upsert it so the location form saves in one go.
    if (timezone !== undefined && timezone !== null && String(timezone).trim()) {
      const [settings] = await models.UserSettings.findOrCreate({ where: { userId }, defaults: { userId } });
      await settings.update({ timezone: String(timezone).trim() });
    }

    res.json(successResponse(PROFILE_MESSAGES.PROFILE_UPDATED, user));
  });

  /**
   * Upload (or replace) the user's profile photo.
   * POST /api/profile/picture  (multipart: `image`)
   *
   * The client crops/zooms to a square and exports a PNG/JPG, which we push to
   * Cloudinary and store on the user. The previous photo (if it was one of ours)
   * is best-effort deleted so we don't leak orphaned uploads.
   */
  uploadProfilePicture = catchAsync(async (req, res) => {
    if (!req.file) throw new ValidationError('Please choose an image to upload');
    if (!ALLOWED_IMAGE_MIME.includes(req.file.mimetype)) {
      throw new ValidationError('Your profile photo must be a PNG or JPG image');
    }

    const result = await uploadToCloudinary(req.file.buffer, PROFILE_FOLDER, 'image');
    const url = result.secure_url || result.url;

    const user = await models.User.findByPk(req.user.id);
    if (!user) throw new NotFoundError('User not found');
    const previous = user.profilePictureUrl;
    user.profilePictureUrl = url;
    await user.save();

    // Clean up the old Cloudinary asset (only ours), best-effort.
    if (previous && previous.includes('res.cloudinary.com') && previous.includes(PROFILE_FOLDER)) {
      deleteFromCloudinary(extractPublicId(previous), 'image').catch(() => {});
    }

    res.json(successResponse('Profile photo updated', { profilePictureUrl: url }));
  });

  /**
   * Get the user's appearance prefs (accent + light/dark) for cross-device sync.
   * GET /api/profile/appearance
   */
  getAppearance = catchAsync(async (req, res) => {
    const settings = await models.UserSettings.findOne({ where: { userId: req.user.id }, attributes: ['theme', 'colorTheme'] });
    res.json(successResponse('Appearance retrieved', {
      theme: settings?.theme || 'light',
      colorTheme: settings?.colorTheme || 'ocean',
    }));
  });

  /**
   * Update the user's appearance prefs.
   * PATCH /api/profile/appearance  { colorTheme?, theme? }
   */
  updateAppearance = catchAsync(async (req, res) => {
    const { colorTheme, theme } = req.body;
    const [settings] = await models.UserSettings.findOrCreate({ where: { userId: req.user.id }, defaults: { userId: req.user.id } });
    const patch = {};
    if (typeof colorTheme === 'string' && colorTheme.trim()) patch.colorTheme = colorTheme.trim().slice(0, 20);
    if (theme === 'light' || theme === 'dark') patch.theme = theme;
    if (Object.keys(patch).length) await settings.update(patch);
    res.json(successResponse('Appearance updated', { theme: settings.theme, colorTheme: settings.colorTheme }));
  });

  /**
   * Backfill the user's timezone from their browser, ONLY if they haven't set
   * one (still 'UTC'/null). Never clobbers a deliberate choice. Called once on
   * login so scheduling + deadlines can be anchored to the user's real zone.
   * POST /api/profile/detect-timezone { timezone: 'Asia/Karachi' }
   */
  detectTimezone = catchAsync(async (req, res) => {
    const tz = String(req.body?.timezone || '').trim();
    // Light sanity check: must look like an IANA zone the runtime accepts.
    let valid = false;
    try { if (tz) { Intl.DateTimeFormat(undefined, { timeZone: tz }); valid = true; } } catch { valid = false; }
    if (!valid) throw new ValidationError('A valid IANA timezone is required');
    const [settings] = await models.UserSettings.findOrCreate({ where: { userId: req.user.id }, defaults: { userId: req.user.id } });
    let updated = false;
    if (!settings.timezone || settings.timezone === 'UTC') {
      await settings.update({ timezone: tz });
      updated = true;
    }
    res.json(successResponse('Timezone synced', { timezone: settings.timezone, updated }));
  });

  /**
   * Merge a group of preference toggles into user_settings.preferences.
   * PATCH /api/profile/preferences  { group: 'notifications'|'learning'|'system'|'userManagement', values: {...} }
   * Stored namespaced by group so different settings tabs don't clobber each other.
   */
  updatePreferences = catchAsync(async (req, res) => {
    const { group, values } = req.body || {};
    if (!group || typeof group !== 'string' || values == null || typeof values !== 'object') {
      throw new ValidationError('group and values are required');
    }
    const [settings] = await models.UserSettings.findOrCreate({ where: { userId: req.user.id }, defaults: { userId: req.user.id } });
    const current = settings.preferences && typeof settings.preferences === 'object' ? settings.preferences : {};
    const next = { ...current, [group]: { ...(current[group] || {}), ...values } };
    await settings.update({ preferences: next });
    res.json(successResponse('Preferences saved', { preferences: next }));
  });

  /**
   * Update the notification channel preferences that ACTUALLY gate delivery.
   * PATCH /api/profile/notifications { emailNotifications?: {...}, pushNotifications?: {...} }
   * Merges into the user_settings columns the notification orchestrator reads,
   * so toggling a category here genuinely turns its emails on/off.
   */
  updateNotificationPreferences = catchAsync(async (req, res) => {
    const { emailNotifications, pushNotifications } = req.body || {};
    const [settings] = await models.UserSettings.findOrCreate({ where: { userId: req.user.id }, defaults: { userId: req.user.id } });

    const patch = {};
    if (emailNotifications && typeof emailNotifications === 'object') {
      const current = settings.emailNotifications && typeof settings.emailNotifications === 'object' ? settings.emailNotifications : {};
      patch.emailNotifications = { ...current, ...emailNotifications };
    }
    if (pushNotifications && typeof pushNotifications === 'object') {
      const current = settings.pushNotifications && typeof settings.pushNotifications === 'object' ? settings.pushNotifications : {};
      patch.pushNotifications = { ...current, ...pushNotifications };
    }
    if (Object.keys(patch).length) await settings.update(patch);
    res.json(successResponse('Notification preferences saved', {
      emailNotifications: settings.emailNotifications,
      pushNotifications: settings.pushNotifications
    }));
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
