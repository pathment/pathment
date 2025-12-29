/**
 * Standardized response messages
 */

const AUTH_MESSAGES = {
  REGISTER_SUCCESS: 'User registered successfully',
  LOGIN_SUCCESS: 'Login successful',
  LOGOUT_SUCCESS: 'Logout successful',
  TOKEN_REFRESH_SUCCESS: 'Token refreshed successfully',
  EMAIL_VERIFICATION_SENT: 'Verification email sent successfully',
  EMAIL_VERIFIED: 'Email verified successfully',
  PASSWORD_RESET_SENT: 'Password reset email sent successfully',
  PASSWORD_RESET_SUCCESS: 'Password reset successful',
  PASSWORD_CHANGE_SUCCESS: 'Password changed successfully',
  INVALID_CREDENTIALS: 'Invalid email or password',
  EMAIL_ALREADY_EXISTS: 'Email already registered',
  USER_NOT_FOUND: 'User not found',
  EMAIL_NOT_VERIFIED: 'Please verify your email before logging in',
  INVALID_TOKEN: 'Invalid or expired token',
  UNAUTHORIZED: 'You are not authorized to perform this action',
  ACCOUNT_DISABLED: 'Your account has been disabled'
};

const USER_MESSAGES = {
  FETCH_SUCCESS: 'User fetched successfully',
  UPDATE_SUCCESS: 'User updated successfully',
  DELETE_SUCCESS: 'User deleted successfully',
  LIST_SUCCESS: 'Users fetched successfully',
  PROFILE_UPDATE_SUCCESS: 'Profile updated successfully'
};

const PROGRAM_MESSAGES = {
  CREATE_SUCCESS: 'Program created successfully',
  UPDATE_SUCCESS: 'Program updated successfully',
  DELETE_SUCCESS: 'Program deleted successfully',
  FETCH_SUCCESS: 'Program fetched successfully',
  LIST_SUCCESS: 'Programs fetched successfully',
  PUBLISH_SUCCESS: 'Program published successfully',
  UNPUBLISH_SUCCESS: 'Program unpublished successfully',
  NOT_FOUND: 'Program not found',
  ALREADY_ENROLLED: 'You are already enrolled in this program',
  ENROLLMENT_SUCCESS: 'Enrolled in program successfully',
  ENROLLMENT_NOT_FOUND: 'Enrollment not found'
};

const TASK_MESSAGES = {
  CREATE_SUCCESS: 'Task created successfully',
  UPDATE_SUCCESS: 'Task updated successfully',
  DELETE_SUCCESS: 'Task deleted successfully',
  FETCH_SUCCESS: 'Task fetched successfully',
  LIST_SUCCESS: 'Tasks fetched successfully',
  ASSIGN_SUCCESS: 'Task assigned successfully',
  SUBMIT_SUCCESS: 'Task submitted successfully',
  NOT_FOUND: 'Task not found',
  ALREADY_SUBMITTED: 'Task already submitted',
  SUBMISSION_NOT_FOUND: 'Submission not found'
};

const NOTIFICATION_MESSAGES = {
  FETCH_SUCCESS: 'Notifications fetched successfully',
  MARK_READ_SUCCESS: 'Notification marked as read',
  MARK_ALL_READ_SUCCESS: 'All notifications marked as read',
  DELETE_SUCCESS: 'Notification deleted successfully'
};

const VALIDATION_MESSAGES = {
  REQUIRED_FIELD: 'This field is required',
  INVALID_EMAIL: 'Invalid email format',
  INVALID_PASSWORD: 'Password must be at least 8 characters with uppercase, lowercase, number and special character',
  PASSWORD_MISMATCH: 'Passwords do not match',
  INVALID_UUID: 'Invalid ID format',
  INVALID_DATE: 'Invalid date format',
  INVALID_ENUM: 'Invalid value provided',
  MIN_LENGTH: 'Minimum length not met',
  MAX_LENGTH: 'Maximum length exceeded',
  INVALID_URL: 'Invalid URL format'
};

const COMMON_MESSAGES = {
  INTERNAL_ERROR: 'An internal server error occurred',
  NOT_FOUND: 'Resource not found',
  BAD_REQUEST: 'Bad request',
  UNAUTHORIZED: 'Unauthorized access',
  FORBIDDEN: 'Forbidden access',
  CONFLICT: 'Resource conflict',
  VALIDATION_ERROR: 'Validation error',
  SUCCESS: 'Operation completed successfully'
};

module.exports = {
  AUTH_MESSAGES,
  USER_MESSAGES,
  PROGRAM_MESSAGES,
  TASK_MESSAGES,
  NOTIFICATION_MESSAGES,
  VALIDATION_MESSAGES,
  COMMON_MESSAGES
};
