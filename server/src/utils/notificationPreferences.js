/**
 * Notification Preference Utilities
 * Handles checking if a user has enabled notifications for specific types
 */

/**
 * Check if user has enabled notifications for a specific type via email
 * @param {Object} settings - UserSettings object with emailNotifications JSONB
 * @param {String} notificationType - Type of notification (e.g., 'message_received', 'task_assigned')
 * @param {Boolean} defaultValue - Default return value if preference not found
 * @returns {Boolean} Whether the notification should be sent
 */
const isEmailNotificationEnabled = (settings, notificationType, defaultValue = true) => {
  if (!settings || !settings.emailNotifications) {
    return defaultValue;
  }

  const prefs = settings.emailNotifications;
  
  // If specific preference is explicitly defined, use it
  if (prefs.hasOwnProperty(notificationType)) {
    return prefs[notificationType];
  }

  // Use default or global enabled flag if present
  if (prefs.hasOwnProperty('enabled')) {
    return prefs.enabled;
  }

  return defaultValue;
};

/**
 * Check if user has enabled notifications for a specific type via push
 * @param {Object} settings - UserSettings object with pushNotifications JSONB
 * @param {String} notificationType - Type of notification
 * @param {Boolean} defaultValue - Default return value if preference not found
 * @returns {Boolean} Whether push notification should be sent
 */
const isPushNotificationEnabled = (settings, notificationType, defaultValue = true) => {
  if (!settings || !settings.pushNotifications) {
    return defaultValue;
  }

  const prefs = settings.pushNotifications;

  // Check if globally enabled
  if (prefs.hasOwnProperty('enabled') && !prefs.enabled) {
    return false;
  }

  // If specific notification type is explicitly disabled, respect it
  if (prefs.hasOwnProperty(notificationType) && !prefs[notificationType]) {
    return false;
  }

  return defaultValue;
};

/**
 * Check if a notification should be created for a user
 * @param {Object} settings - UserSettings object
 * @param {String} notificationType - Type of notification
 * @param {Object} options - Additional options
 *   - checkEmail: boolean (default true) - Check email notification preference
 *   - checkPush: boolean (default true) - Check push notification preference
 *   - respectQuietHours: boolean (default true) - Respect quiet hours setting
 * @returns {Object} { should_create: boolean, reason: string }
 */
const shouldCreateNotification = (settings, notificationType, options = {}) => {
  const {
    checkEmail = true,
    checkPush = true,
    respectQuietHours = false
  } = options;

  // Check email preferences
  if (checkEmail && !isEmailNotificationEnabled(settings, notificationType)) {
    return {
      should_create: false,
      reason: `Email notifications for '${notificationType}' are disabled`
    };
  }

  // Check push preferences
  if (checkPush && !isPushNotificationEnabled(settings, notificationType)) {
    return {
      should_create: false,
      reason: `Push notifications for '${notificationType}' are disabled`
    };
  }

  // Check quiet hours if enabled
  if (respectQuietHours && settings?.quietHours?.enabled) {
    const { startTime, endTime } = settings.quietHours;
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    const start = parseInt(startTime) * 60;
    const end = parseInt(endTime) * 60;

    if (start < end) {
      if (currentTime >= start && currentTime < end) {
        return {
          should_create: false,
          reason: 'User is in quiet hours'
        };
      }
    } else {
      // Quiet hours wrap around midnight
      if (currentTime >= start || currentTime < end) {
        return {
          should_create: false,
          reason: 'User is in quiet hours'
        };
      }
    }
  }

  return {
    should_create: true,
    reason: 'All notification checks passed'
  };
};

/**
 * Batch check notification preferences for multiple users
 * @param {Array} usersWithSettings - Array of {userId, settings} objects
 * @param {String} notificationType - Type of notification to check
 * @returns {Object} Map of userId => should_create boolean
 */
const checkNotificationsForUsers = (usersWithSettings, notificationType) => {
  const result = {};

  usersWithSettings.forEach(({ userId, settings }) => {
    result[userId] = shouldCreateNotification(settings, notificationType).should_create;
  });

  return result;
};

module.exports = {
  isEmailNotificationEnabled,
  isPushNotificationEnabled,
  shouldCreateNotification,
  checkNotificationsForUsers
};
